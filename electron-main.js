import { app as App, BrowserWindow, shell as Shell, ipcMain as IpcMain, dialog as Dialog } from 'electron';
import Path from 'path';
import FileSystem from 'fs';
import { fileURLToPath as FileURLToPath } from 'url';
import { Worker } from 'node:worker_threads';

const __dirname = Path.dirname(FileURLToPath(import.meta.url));

let MainWindow = null;

const StatsClientId = '2c07c58bb20c4f529f5e262b85b6b1ba';
const StatsRedirectUri = 'https://www.statsforspotify.com/login/callback';

function CreateWindow() {
  MainWindow = new BrowserWindow({
    width: 1220,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121212',
    title: 'Stats for Spotify',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: Path.join(__dirname, 'preload.cjs'),
      partition: 'persist:spotify_session',
    },
  });

  MainWindow.webContents.setWindowOpenHandler(({ url: Url }) => {
    Shell.openExternal(Url);
    return { action: 'deny' };
  });

  MainWindow.loadFile(Path.join(__dirname, 'dist/index.html'));
}

IpcMain.handle('open-popup-auth', (Event, { scopes: Scopes, challenge: Challenge }) => {
  return new Promise((Resolve, Reject) => {
    const AuthWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: MainWindow,
      modal: true,
      backgroundColor: '#121212',
      title: 'Spotify Authorization',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:spotify_session',
      }
    });

    AuthWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['https://www.statsforspotify.com/login/callback*'] },
      (Details, Callback) => {
        try {
          const ParsedURL = new URL(Details.url);
          const Code = ParsedURL.searchParams.get('code');
          const AuthError = ParsedURL.searchParams.get('error');

          AuthWindow.close();
          Callback({ cancel: true });
          if (Code) return Resolve({ code: Code });
          Reject(new Error(AuthError || 'Cancelled'));
        } catch (RequestError) {
          Reject(RequestError);
        }
      }
    );

    const Params = new URLSearchParams({
      client_id: StatsClientId,
      response_type: 'code',
      redirect_uri: StatsRedirectUri,
      scope: Scopes,
      code_challenge_method: 'S256',
      code_challenge: Challenge,
    });

    AuthWindow.loadURL(`https://accounts.spotify.com/authorize?${Params.toString()}`);
  });
});

IpcMain.handle('open-external-url', (Event, Url) => Shell.openExternal(Url));

function ParseHistoryFiles(FilePaths) {
  return new Promise((Resolve, Reject) => {
    const HistoryWorker = new Worker(new URL('./historyWorker.node.js', import.meta.url), { workerData: FilePaths });
    let Settled = false;

    HistoryWorker.once('message', Result => {
      Settled = true;
      Resolve(Result);
    });
    HistoryWorker.once('error', WorkerError => {
      Settled = true;
      Reject(WorkerError);
    });
    HistoryWorker.once('exit', Code => {
      if (!Settled) Reject(new Error(`History worker exited before returning data (code ${Code})`));
    });
  });
}

IpcMain.handle('scan-downloads-history', async () => {
  const DownloadsDirectory = App.getPath('downloads');
  try {
    const FileNames = await FileSystem.promises.readdir(DownloadsDirectory);
    const TargetFiles = FileNames.filter(FileName => /^(StreamingHistory.*|endsong.*)\.json$/i.test(FileName));
    if (!TargetFiles.length) return { historyData: null, files: [], errors: [] };

    return await ParseHistoryFiles(TargetFiles.map(FileName => Path.join(DownloadsDirectory, FileName)));
  } catch (ScanError) {
    return { error: ScanError.message };
  }
});

IpcMain.handle('select-history-files', async () => {
  const Selection = await Dialog.showOpenDialog(MainWindow, {
    title: 'Select Spotify Streaming History JSON Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  if (Selection.canceled || !Selection.filePaths.length) return null;

  try {
    return await ParseHistoryFiles(Selection.filePaths);
  } catch (SelectionError) {
    return { error: SelectionError.message };
  }
});

App.whenReady().then(() => {
  if (App.userAgentFallback) {
    App.userAgentFallback = App.userAgentFallback.replace(/Electron\/\S+\s?/, '');
  }
  CreateWindow();
  App.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) CreateWindow();
  });
});

App.on('window-all-closed', () => {
  if (process.platform !== 'darwin') App.quit();
});
