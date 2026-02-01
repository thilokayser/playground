const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

const DATA_DIR_NAME = 'DWC Commander - Biohazard Edition';
const DATA_FILE_NAME = 'dwc-data.json';
const PHOTOS_DIR_NAME = 'photos';
const EXPORTS_DIR_NAME = 'exports';

const defaultData = {
  setup: {
    startDate: '',
    harvestDays: 56,
    plants: [
      { name: 'Pflanze 1', bucket: 'Eimer A', strain: '', breeder: '' },
      { name: 'Pflanze 2', bucket: 'Eimer B', strain: '', breeder: '' }
    ],
    thresholds: {
      phLow: 5.5,
      phHigh: 6.5,
      ecHigh: 2.4,
      waterTempHigh: 22.5
    }
  },
  recipes: {
    selected: 'Standard Veg',
    presets: [
      { name: 'Standard Veg', grow: 2.5, bloom: 0, boost: 0 },
      { name: 'Bloom Week', grow: 1.5, bloom: 5, boost: 1 },
      { name: 'Heavy Feed', grow: 3, bloom: 6, boost: 1.5 }
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

function getPhotosDirPath(logId) {
  const documentsPath = app.getPath('documents');
  return path.join(documentsPath, DATA_DIR_NAME, PHOTOS_DIR_NAME, logId);
}

async function importPhotos(logId, files) {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      return { ok: true, paths: [] };
    }
    const destDir = getPhotosDirPath(logId);
    await fs.mkdir(destDir, { recursive: true });
    const copyResults = await Promise.all(
      files.map(async (filePath) => {
        const fileName = path.basename(filePath);
        const destPath = path.join(destDir, fileName);
        await fs.copyFile(filePath, destPath);
        return destPath;
      })
    );
    return { ok: true, paths: copyResults };
  } catch (error) {
    return { ok: false, error: `Fehler beim Importieren der Fotos: ${error.message}` };
  }
}

async function exportData(payload, type) {
  try {
    const documentsPath = app.getPath('documents');
    const exportsDir = path.join(documentsPath, DATA_DIR_NAME, EXPORTS_DIR_NAME);
    await fs.mkdir(exportsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (type === 'csv') {
      const headers = [
        'timestamp',
        'airTemp',
        'humidity',
        'h2o2Refill',
        'notes',
        'plant1_name',
        'plant1_ph',
        'plant1_ec',
        'plant1_waterTemp',
        'plant1_root',
        'plant2_name',
        'plant2_ph',
        'plant2_ec',
        'plant2_waterTemp',
        'plant2_root'
      ];
      const rows = payload.logs.map((log) => [
        log.timestamp,
        log.airTemp ?? '',
        log.humidity ?? '',
        log.h2o2Refill ? 'yes' : 'no',
        `"${(log.notes || '').replace(/"/g, '""')}"`,
        log.plants[0]?.name ?? '',
        log.plants[0]?.ph ?? '',
        log.plants[0]?.ec ?? '',
        log.plants[0]?.waterTemp ?? '',
        log.plants[0]?.rootHealth ?? '',
        log.plants[1]?.name ?? '',
        log.plants[1]?.ph ?? '',
        log.plants[1]?.ec ?? '',
        log.plants[1]?.waterTemp ?? '',
        log.plants[1]?.rootHealth ?? ''
      ]);
      const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      const csvPath = path.join(exportsDir, `dwc-export-${stamp}.csv`);
      await fs.writeFile(csvPath, csv, 'utf-8');
      return { ok: true, path: csvPath };
    }
    const jsonPath = path.join(exportsDir, `dwc-export-${stamp}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true, path: jsonPath };
  } catch (error) {
    return { ok: false, error: `Fehler beim Export: ${error.message}` };
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
  ipcMain.handle('dwc:importPhotos', async (_event, logId, files) => importPhotos(logId, files));
  ipcMain.handle('dwc:export', async (_event, payload, type) => exportData(payload, type));

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
