import cliSelect from "cli-select";
import process from "process";
import { getLines } from "./util";

type ScenarioStop = {
    timestamp: Date;
    scenarioName: string;
    scenarioTimeMs: number;
}

const dateRegex = new RegExp(/^(20[0-9]{2})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z (.*)/);

const maybeParseDate = (line: string): [Date | undefined, string] => {
    const timestampMatch = dateRegex.exec(line);
    if (!timestampMatch) {
        return [undefined, line];
    }

    const [_, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, rawMillisecond, restOfLine] = timestampMatch;
    return [new Date(
        parseInt(rawYear), 
        parseInt(rawMonth) - 1, 
        parseInt(rawDay), 
        parseInt(rawHour), 
        parseInt(rawMinute), 
        parseInt(rawSecond), 
        parseInt(rawMillisecond)), restOfLine];
}

type LogLevel = "War" | "Inf" | "Err";

const maybeParseLogLevel = (line: string): [LogLevel | undefined, string] => {
    const tokens = line.split(/\s+/);
    return [tokens[0] as any, tokens.slice(1).join(" ")];
};

const scenarioInfoRegex = new RegExp(/\[Scenario\](\w+) \[step\]\(([0-9]+)\)stop \((?:-?[0-9]+ms\/)?([0-9]+)ms\)/);

const maybeParseScenarioInfo = (line: string): Pick<ScenarioStop, 'scenarioName' | 'scenarioTimeMs'> | undefined => {
    const scenarioInfoMatch = scenarioInfoRegex.exec(line);
    if (!scenarioInfoMatch) {
        return undefined;
    }

    const [_, scenarioName, _scenarioStepIndex, scenarioTimeMs] = scenarioInfoMatch;

    return {
        scenarioName, 
        scenarioTimeMs: parseInt(scenarioTimeMs)
    };
};

const parseScenarios = (lines: string[]) => {
    const scenarios: ScenarioStop[] = [];
    lines.forEach(line => {
        const [dateMatch, afterDate] = maybeParseDate(line);
        if (!dateMatch) {
            return;
        }

        const [logLevel, afterLogLevel] = maybeParseLogLevel(afterDate);
        if (!logLevel) {
            return;
        }

        const scenarioInfo = maybeParseScenarioInfo(afterLogLevel);
        if (!scenarioInfo) {
            return;
        }

        scenarios.push({
            timestamp: dateMatch,
            ...scenarioInfo
        });
    });
    return scenarios;
};

const chooseDateComponent = async (dates: Date[], componentSelector: (d: Date) => number, componentName: string): Promise<[number, Date[]]> => {
    const availableComponentValues = dates.reduce((prev: number[], current: Date) => {
        const currentComponent = componentSelector(current);
        if (!prev.includes(currentComponent)) {
            prev.push(currentComponent);
        }
        return prev;
    }, []);
    let selectedComponentValue = availableComponentValues[0];
    if (availableComponentValues.length >= 2) {
        console.log(`Which ${componentName}?`);
        selectedComponentValue = (await cliSelect({values: availableComponentValues})).value;
    }
    return [selectedComponentValue, dates.filter(d => componentSelector(d) === selectedComponentValue)];
};

const chooseStartTime = async (scenarios: ScenarioStop[]) => {
    const dates = scenarios.map(scenario => scenario.timestamp);
    const [year, yearDates] = await chooseDateComponent(dates, d => d.getFullYear(), "year");
    const [month, monthDates] = await chooseDateComponent(yearDates, d => d.getMonth(), "month");
    const [day, dayDates] = await chooseDateComponent(monthDates, d => d.getDate(), "day");
    const [hour, hourDates] = await chooseDateComponent(dayDates, d => d.getHours(), "hour");
    const [minute, _minuteDates] = await chooseDateComponent(hourDates, d => d.getMinutes(), "minute");
    return new Date(year, month, day, hour, minute);

};

const scenarioNameCounts = (scenarios: ScenarioStop[]) => {
    const results: Record<string, number> = {};
    scenarios.forEach(scenario => {
        if (results[scenario.scenarioName]) {
            results[scenario.scenarioName]++;
        } else {
            results[scenario.scenarioName] = 1;
        }
    });
    return results;
}

(async () => {
    const inputFileName = process.argv[2];
    const scenariosOfInterest = process.argv[3].split(",");
    const lines = await getLines(inputFileName);

    const scenarios = parseScenarios(lines);
    const startTime = await chooseStartTime(scenarios);

    const timeMatchScenarios = scenarios.filter(scenario => scenario.timestamp >= startTime);
    const nameMatchScenarios = timeMatchScenarios.filter(scenario =>scenariosOfInterest.includes(scenario.scenarioName));
    nameMatchScenarios
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .forEach(scenario => console.log(`${scenario.scenarioName}: ${scenario.scenarioTimeMs}ms`));
})();

