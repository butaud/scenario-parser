import { promises } from "fs";

export const getLines = async (filename: string) => {
    const inputFile = await promises.readFile(filename, {encoding: "utf8"});
    const inputFileString = inputFile.toString();
    return inputFileString.split("\n").map(line => line.trim());
};