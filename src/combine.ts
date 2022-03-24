import process from "process";
import { getLines } from "./util";

const getRecords = async (filename: string): Promise<string[][]> => {
    const platform = filename.includes("desktop") ? "desktop" : "web";
    const lines = await getLines(filename);
    const records = lines.slice(1).map(line => [...line.split("|"), platform]);
    return records.filter(record => record.length === 6);
}

(async () => {
    const filenames = process.argv.slice(2);
    const allRecords = [["Metric", "Index", "Angular", "React", "Change", "Platform"]];
    for (const filename of filenames) {
        allRecords.push(...(await getRecords(filename)));
    }
    allRecords.forEach(record => console.log(record.join("|")));
})();