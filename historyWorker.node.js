import { readFile as ReadFile } from 'node:fs/promises';
import { basename as BaseName } from 'node:path';
import { parentPort as ParentPort, workerData as WorkerData } from 'node:worker_threads';
import { MergeSpotifyHistory, ParseSpotifyRecords } from './src/historyParser.js';

let HistoryData = null;
const Files = [];
const Errors = [];

for (const FilePath of WorkerData) {
  try {
    const Records = JSON.parse(await ReadFile(FilePath, 'utf8'));
    if (!Array.isArray(Records)) {
      Errors.push(BaseName(FilePath));
      continue;
    }
    HistoryData = MergeSpotifyHistory(HistoryData, ParseSpotifyRecords(Records));
    Files.push(BaseName(FilePath));
  } catch {
    Errors.push(BaseName(FilePath));
  }
}

ParentPort?.postMessage({ historyData: HistoryData, files: Files, errors: Errors });
