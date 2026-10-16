import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Worker } from 'node:worker_threads';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let loopbackServer = null;

const statsClientId = '2c07c58bb20c4f529f5e262b85b6b1ba';
const statsRedirectUri = 'https://www.statsforspotify.com/login/callback';

function createWindow() {
  mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload.cjs'),
      partition: 'persist:spotify_session',
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
}

const closeLoopback = () => {
  if (!loopbackServer) return;
  try { loopbackServer.close(); } catch {}
  loopbackServer = null;
};

ipcMain.handle('open-browser-auth', (event, { clientId, scopes, challenge }) => {
  return new Promise((resolve, reject) => {
    closeLoopback();

    loopbackServer = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        if (reqUrl.pathname !== '/callback') return;

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html><html><head><meta charset="utf-8"><title>Stats for Spotify</title>
          <style>body{background:#121212;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}
          .badge{width:64px;height:64px;border-radius:50%;background:#1db954;display:flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:20px;}</style></head>
          <body><div class="badge">✓</div><h1>Xác thực thành công!</h1><p>Đang đồng bộ dữ liệu vào App. Bạn có thể đóng tab này.</p>
          <script>setTimeout(()=>window.close(),1500);</script></body></html>
        `);

        closeLoopback();
        mainWindow?.focus();
        if (code) return resolve({ code });
        reject(new Error(error || 'User cancelled authorization'));
      } catch (err) {
        res.writeHead(500);
        res.end('Server error');
        reject(err);
      }
    });

    loopbackServer.listen(8888, '127.0.0.1', () => {
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: 'http://127.0.0.1:8888/callback',
        scope: scopes,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      });
      shell.openExternal(`https://accounts.spotify.com/authorize?${params.toString()}`);
    });

    loopbackServer.on('error', reject);
  });
});

ipcMain.handle('open-popup-auth', (event, { scopes, challenge }) => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: mainWindow,
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

    authWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['https://www.statsforspotify.com/login/callback*'] },
      (details, callback) => {
        try {
          const parsed = new URL(details.url);
          const code = parsed.searchParams.get('code');
          const error = parsed.searchParams.get('error');

          authWindow.close();
          callback({ cancel: true });
          if (code) return resolve({ code });
          reject(new Error(error || 'Cancelled'));
        } catch (e) {
          reject(e);
        }
      }
    );

    const params = new URLSearchParams({
      client_id: statsClientId,
      response_type: 'code',
      redirect_uri: statsRedirectUri,
      scope: scopes,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });

    authWindow.loadURL(`https://accounts.spotify.com/authorize?${params.toString()}`);
  });
});

ipcMain.handle('open-external-url', (_, url) => shell.openExternal(url));

function parseHistoryFiles(filePaths) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./historyWorker.node.js', import.meta.url), { workerData: filePaths });
    let settled = false;

    worker.once('message', result => {
      settled = true;
      resolve(result);
    });
    worker.once('error', error => {
      settled = true;
      reject(error);
    });
    worker.once('exit', code => {
      if (!settled) reject(new Error(`History worker exited before returning data (code ${code})`));
    });
  });
}

ipcMain.handle('scan-downloads-history', async () => {
  const downloadsDir = app.getPath('downloads');
  try {
    const files = await fs.promises.readdir(downloadsDir);
    const targetFiles = files.filter(f => /^(StreamingHistory.*|endsong.*)\.json$/i.test(f));
    if (!targetFiles.length) return { historyData: null, files: [], errors: [] };

    return await parseHistoryFiles(targetFiles.map(file => path.join(downloadsDir, file)));
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('select-history-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Spotify Streaming History JSON Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths.length) return null;

  try {
    return await parseHistoryFiles(result.filePaths);
  } catch (err) {
    return { error: err.message };
  }
});

app.whenReady().then(() => {
  if (app.userAgentFallback) {
    app.userAgentFallback = app.userAgentFallback.replace(/Electron\/\S+\s?/, '');
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeLoopback();
  if (process.platform !== 'darwin') app.quit();
});
