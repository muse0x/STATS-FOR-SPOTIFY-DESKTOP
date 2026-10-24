import { MergeSpotifyHistory, ParseSpotifyRecords } from './historyParser.js';

self.addEventListener('message', async ({ data: Data }) => {
  let HistoryData = null;
  const Files = [];
  const Errors = [];

  for (const File of Data.files) {
    try {
      const Records = JSON.parse(await File.text());
      if (!Array.isArray(Records)) {
        Errors.push(File.name);
        continue;
      }
      HistoryData = MergeSpotifyHistory(HistoryData, ParseSpotifyRecords(Records));
      Files.push(File.name);
    } catch {
      Errors.push(File.name);
    }
  }

  self.postMessage({ historyData: HistoryData, files: Files, errors: Errors });
});
