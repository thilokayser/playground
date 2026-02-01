const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

const DATA_DIR_NAME = 'DWC Commander - Biohazard Edition';
const DATA_FILE_NAME = 'dwc-data.json';

const defaultData = {
  setup: {
    startDate: '',
    harvestDays: 56,
    plants: [
      { name: 'Pflanze 1', bucket: 'Eimer A', strain: '' },
      { name: 'Pflanze 2', bucket: 'Eimer B', strain: '' }
    ]
  },
  logs: []
};

function getDataFilePath() {
  const documentsPath = app.getPath('documents');
  return path.join(documentsPath, DATA_DIR_NAME, DATA_FILE_NAME);
}

async function ensureDataDir() {
  const documentsPath = app.getPath('documents');
  const dataDir = path.join(documentsPath, DATA_DIR_NAME);
  await fs.mkdir(dataDir, { recursive: true });
}

async function loadData() {
  try {
    const filePath = getDataFilePath();
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ok: true, data: parsed };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ok: true, data: defaultData, info: 'Datei nicht gefunden, Standarddaten geladen.' };
    }
    return { ok: false, error: `Fehler beim Laden: ${error.message}` };
  }
}

async function saveData(payload) {
  try {
    await ensureDataDir();
    const filePath = getDataFilePath();
    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(filePath, serialized, 'utf-8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Fehler beim Speichern: ${error.message}` };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#050608',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('dwc:load', async () => loadData());
  ipcMain.handle('dwc:save', async (_event, payload) => saveData(payload));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
