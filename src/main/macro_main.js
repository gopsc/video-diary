const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const diaryDir = path.join(app.getPath('home'), 'video-diary');

function ensureDiaryDir() {
  if (!fs.existsSync(diaryDir)) {
    fs.mkdirSync(diaryDir, { recursive: true });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'macro_preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'macro_index.html'));

}

ipcMain.handle('save-video', async (event, buffer, filename) => {
  ensureDiaryDir();
  const safeName = path.basename(filename);
  const filePath = path.join(diaryDir, safeName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

ipcMain.handle('list-videos', async () => {
  ensureDiaryDir();
  return fs.readdirSync(diaryDir)
    .filter((f) => f.endsWith('.webm'))
    .sort()
    .reverse();
});

ipcMain.handle('get-video-path', async (event, filename) => {
  return path.join(diaryDir, path.basename(filename));
});

app.whenReady().then(() => {
  ensureDiaryDir();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});