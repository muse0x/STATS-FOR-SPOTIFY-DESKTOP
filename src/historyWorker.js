import { mergeSpotifyHistory, parseSpotifyRecords } from './historyParser.js';

self.addEventListener('message', async ({ data }) => {
  let historyData = null;
  const files = [];
  const errors = [];

  for (const file of data.files) {
    try {
      const records = JSON.parse(await file.text());
      if (!Array.isArray(records)) {
        errors.push(file.name);
        continue;
      }
      historyData = mergeSpotifyHistory(historyData, parseSpotifyRecords(records));
      files.push(file.name);
    } catch {
      errors.push(file.name);
    }
  }

  self.postMessage({ historyData, files, errors });
});
