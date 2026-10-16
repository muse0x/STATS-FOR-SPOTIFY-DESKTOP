import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { mergeSpotifyHistory, parseSpotifyRecords } from './src/historyParser.js';

let historyData = null;
const files = [];
const errors = [];

for (const filePath of workerData) {
  try {
    const records = JSON.parse(await readFile(filePath, 'utf8'));
    if (!Array.isArray(records)) {
      errors.push(basename(filePath));
      continue;
    }
    historyData = mergeSpotifyHistory(historyData, parseSpotifyRecords(records));
    files.push(basename(filePath));
  } catch {
    errors.push(basename(filePath));
  }
}

parentPort?.postMessage({ historyData, files, errors });
