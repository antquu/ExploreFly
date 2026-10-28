/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Main process: windows, file dialogs, web view capture, statistics relay and updates.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, webContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join, extname, basename } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const IMAGE = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg'];
const VIDEO = ['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv'];
const UPDATE_EVERY = 4 * 60 * 60 * 1000;

let win: BrowserWindow | null = null;
let statsWin: BrowserWindow | null = null;
let updateStatus: { state: string; version?: string; percent?: number } = { state: 'idle' };

function kindOf(path: string): 'image' | 'video' | 'page' {
  const ext = extname(path).toLowerCase();
  if (IMAGE.includes(ext) && ext !== '.svg') return 'image';
  if (VIDEO.includes(ext)) return 'video';
  return 'page';
}

function describe(path: string) {
  return { name: basename(path), url: pathToFileURL(path).href, kind: kindOf(path) };
}

function loadRenderer(w: BrowserWindow, hash = '') {
  if (process.env.ELECTRON_RENDERER_URL) w.loadURL(process.env.ELECTRON_RENDERER_URL + (hash ? '#' + hash : ''));
  else w.loadFile(join(__dirname, '../renderer/index.html'), { hash });
}

function baseWindow(options: Electron.BrowserWindowConstructorOptions) {
  const w = new BrowserWindow({
    show: false,
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 47 },
    ...options,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
      ...options.webPreferences,
    },
  });
  w.once('ready-to-show', () => w.show());
  // Links that open a new window go to the system browser
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  return w;
}

function createWindow() {
  win = baseWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    title: 'ExploreFly',
    webPreferences: { webviewTag: true },
  });
  win.on('closed', () => {
    win = null;
    statsWin?.close();
  });
  loadRenderer(win);
}

// Opens the statistics window, or brings it to the front
function openStats() {
  if (statsWin) {
    statsWin.focus();
    return;
  }
  statsWin = baseWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'ExploreFly · Statistics',
  });
  statsWin.on('closed', () => {
    statsWin = null;
    win?.webContents.send('stats:state', false);
  });
  loadRenderer(statsWin, 'stats');
  win?.webContents.send('stats:state', true);
}

// Locks down every embedded web view and keeps popups inside it
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, prefs) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.plugins = true;
  });
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^(https?|file):/.test(url)) contents.loadURL(url);
      return { action: 'deny' };
    });
  }
});

ipcMain.handle('file:pick', async () => {
  if (!win) return null;
  const res = await dialog.showOpenDialog(win, {
    title: 'Open a file',
    properties: ['openFile'],
    filters: [
      { name: 'Media and documents', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', 'pdf', 'html', 'htm', 'txt', 'md', 'json'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return describe(res.filePaths[0]);
});

ipcMain.handle('file:describe', (_e, path: string) => describe(path));

ipcMain.handle('file:save', async (e, name: string, text: string) => {
  const owner = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const res = await dialog.showSaveDialog(owner!, {
    title: 'Export',
    defaultPath: name,
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePath) return false;
  await writeFile(res.filePath, text, 'utf8');
  return true;
});

// Grabs a small BGRA frame of a web view for the fly's eyes
ipcMain.handle('view:capture', async (_e, id: number, width: number) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return null;
  const img = await wc.capturePage();
  if (img.isEmpty()) return null;
  const small = img.resize({ width, quality: 'good' });
  const size = small.getSize();
  return { width: size.width, height: size.height, data: small.toBitmap() };
});

ipcMain.handle('shell:open', (_e, url: string) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

// ---------- Statistics relay ----------
ipcMain.handle('stats:open', () => openStats());
ipcMain.on('stats:push', (_e, payload) => statsWin?.webContents.send('stats:data', payload));
ipcMain.on('stats:request', () => win?.webContents.send('stats:request'));
ipcMain.on('stats:command', (_e, cmd: string) => win?.webContents.send('stats:command', cmd));

// ---------- Updates from GitHub releases ----------
function sendUpdate(status: typeof updateStatus) {
  updateStatus = status;
  win?.webContents.send('update:status', status);
}

function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => sendUpdate({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ ...updateStatus, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
  autoUpdater.on('error', () => {
    if (updateStatus.state === 'downloading') sendUpdate({ state: 'idle' });
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, UPDATE_EVERY);
}

ipcMain.handle('update:current', () => updateStatus);
ipcMain.handle('update:install', () => {
  if (updateStatus.state === 'ready') autoUpdater.quitAndInstall();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(() => {
    createWindow();
    setupUpdates();
  });
  app.on('window-all-closed', () => app.quit());
}
