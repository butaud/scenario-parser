import { getLines } from "./util";
import process from "process";

type Scenario = {
    scenarioName: string;
    scenarioTime: number;
}
const scenarioRegex = new RegExp(/(\w+): ([0-9]+)ms/);
const parseScenario = (line: string): Scenario | undefined => {
    const match = scenarioRegex.exec(line);
    if (match) {
        return {
            scenarioName: match[1],
            scenarioTime: parseInt(match[2])
        };
    } else {
        return undefined;
    }
}

const parseScenarios = (lines: string[]): Scenario[] => {
    const results: Scenario[] = [];
    lines.forEach(line => {
        const maybeScenario = parseScenario(line);
        if (maybeScenario) {
            results.push(maybeScenario);
        }
    });
    return results;
}

type ParserState = "LookingForAlt" | "LookingForNextCst" | "LookingForNextAst" | "Complete";
type ParsedResult = {
    metric: string;
    index: number;
    time: number;
}
abstract class AbstractStateMachineParser {
    state: ParserState = "LookingForAlt";
    index = 0;
    stIndex = 0;
    stLimit: number;
    results: Scenario[];

    constructor(results: Scenario[], stLimit: number) {
        this.results = results;
        this.stLimit = stLimit;
    }

    isComplete() {
        return this.state === "Complete";
    }

    protected isEmpty() {
        return this.index >= this.results.length;
    }

    protected lookForNext(scenarioName: string): Scenario | undefined {
        while (!this.isEmpty()) {
            const current = this.results[this.index];
            this.index++;
            if (current.scenarioName === scenarioName) {
                return current;
            }
        }
        return undefined;
    }

    protected getNextSt(metric: string, scenarioName: string, nextState: ParserState): ParsedResult {
        const maybeScenario = this.lookForNext(scenarioName);
        if (!maybeScenario) {
            throw new Error(`could not find ${metric} for index ${this.stIndex}`);
        }

        const result = {
            metric: metric,
            index: this.stIndex,
            time: maybeScenario.scenarioTime
        };
        
        this.stIndex++;
        if (this.stIndex >= this.stLimit) {
            this.stIndex = 0;
            this.state = nextState;
        }
        return result;
    }

    abstract next(): ParsedResult;
}

class ReactStateMachineParser extends AbstractStateMachineParser {
    next(): ParsedResult {
        if (this.state === "Complete") {
            throw new Error("already complete");
        }
        if (this.isEmpty()) {
            throw new Error(`parser is empty in state ${this.state}`);
        }
        
        if (this.state === "LookingForAlt") {
            const maybeScenario = this.lookForNext("application_launch_time");
            if (!maybeScenario) {
                throw new Error("could not find ALT");
            }
            this.state = "LookingForNextCst";
            return {
                metric: "ALT",
                index: 0,
                time: maybeScenario.scenarioTime
            };
        } else if (this.state === "LookingForNextCst") {
            const result = this.getNextSt("CST", "messaging_switch_channel_v2", "LookingForNextAst");

            if (this.state as string === "LookingForNextAst") {
                // Consume the next hybrid_entity_teams_grid_load because it will be navigating back from STV
                this.lookForNext("hybrid_entity_teams_grid_load");
            }

            return result;
        }  else { // this.state === "LookingForNextAst"
            const result = this.getNextSt("AST", "hybrid_entity_teams_grid_load", "Complete");
            return result;
        }
    }
}

class AngularStateMachineParser extends AbstractStateMachineParser {
    next(): ParsedResult {
        if (this.state === "Complete") {
            throw new Error("already complete");
        }
        if (this.isEmpty()) {
            throw new Error(`parser is empty in state ${this.state}`);
        }
        
        if (this.state === "LookingForAlt") {
            const maybeScenario = this.lookForNext("application_launch_time");
            if (!maybeScenario) {
                throw new Error("could not find ALT");
            }
            this.state = "LookingForNextCst";
            return {
                metric: "ALT",
                index: 0,
                time: maybeScenario.scenarioTime
            };
        } else if (this.state === "LookingForNextCst") {
            const result = this.getNextSt("CST", "messaging_switch_channel_v2", "LookingForNextAst");

            if (this.state as string === "LookingForNextAst") {
                // Consume the next hybrid_entity_teams_grid_load because it will be navigating back from STV
                this.lookForNext("teams_grid_load");
            }

            return result;
        } else { // this.state === "LookingForNextAst"
            const result = this.getNextSt("AST", "teams_grid_load", "Complete");
            return result;
        }
    }
}

const calculateDiff = (angularTime: number, reactTime: number) => {
    const diff = reactTime - angularTime;
    return `${Math.round(100 * diff / angularTime)}%`;
}

(async () => {
    const angularResultsFilename = process.argv[2];
    const reactResultsFilename = process.argv[3];

    const angularResults = parseScenarios(await getLines(angularResultsFilename));
    const reactResults = parseScenarios(await getLines(reactResultsFilename));

    const angularParser = new AngularStateMachineParser(angularResults, 5);
    const reactParser = new ReactStateMachineParser(reactResults, 5);
    const outputRecords = [["Metric", "Index", "Angular", "React", "Change"]];
    while (!angularParser.isComplete() && !reactParser.isComplete()) {
        const nextAngularResult = angularParser.next();
        const nextReactResult = reactParser.next();
        const diff = calculateDiff(nextAngularResult.time, nextReactResult.time);
        outputRecords.push([nextAngularResult.metric, nextAngularResult.index.toString(), nextAngularResult.time.toString(), nextReactResult.time.toString(), diff]);
    }
    outputRecords.forEach(record => console.log(record.join("|")));
})();