const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

const DATA_DIR_NAME = 'DWC Commander - Biohazard Edition';
const DATA_FILE_NAME = 'dwc-data.json';
const PHOTOS_DIR_NAME = 'photos';
const EXPORTS_DIR_NAME = 'exports';
const WEEKLY_SUMMARY_FILE = 'weekly_summary.json';
const NUTRIENT_DB_FILE = 'nutrient_database.json';

const defaultData = {
  setup: {
    startDate: '',
    harvestDays: 56,
    plants: [
      { name: 'Pflanze 1', bucket: 'Eimer A', bucketSizeL: 20, strain: '', breeder: '' },
      { name: 'Pflanze 2', bucket: 'Eimer B', bucketSizeL: 20, strain: '', breeder: '' }
    ],
    thresholds: {
      phLow: 5.5,
      phHigh: 6.5,
      ecHigh: 2.4,
      waterTempHigh: 22.5
    },
    nutrients: {
      profileId: 'hesi-hydro',
      phase: 'veg'
    },
    light: {
      startTime: '06:00',
      phase: 'veg'
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

function getWeeklySummaryPath() {
  const documentsPath = app.getPath('documents');
  return path.join(documentsPath, DATA_DIR_NAME, WEEKLY_SUMMARY_FILE);
}

function getNutrientDatabasePath() {
  return path.join(__dirname, NUTRIENT_DB_FILE);
}

async function ensureDataDir() {
  const documentsPath = app.getPath('documents');
  const dataDir = path.join(documentsPath, DATA_DIR_NAME);
  await fs.mkdir(dataDir, { recursive: true });
}

async function loadNutrientDatabase() {
  try {
    const raw = await fs.readFile(getNutrientDatabasePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { ok: true, data: parsed };
  } catch (error) {
    return { ok: false, error: `Fehler beim Laden der Nährstoffdatenbank: ${error.message}` };
  }
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

function calculateStabilityIndex(logs) {
  if (!logs.length) return null;
  const phValues = logs.flatMap((log) => log.plants.map((plant) => plant.ph)).filter((v) => v !== null);
  const ecValues = logs.flatMap((log) => log.plants.map((plant) => plant.ec)).filter((v) => v !== null);
  if (!phValues.length || !ecValues.length) return null;
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const phAvg = average(phValues);
  const ecAvg = average(ecValues);
  const phVariance = average(phValues.map((v) => (v - phAvg) ** 2));
  const ecVariance = average(ecValues.map((v) => (v - ecAvg) ** 2));
  const phScore = Math.max(0, 50 - phVariance * 100);
  const ecScore = Math.max(0, 50 - ecVariance * 20);
  return Math.min(100, Math.round(phScore + ecScore));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function updateWeeklySummary() {
  try {
    const { ok, data } = await loadData();
    if (!ok) return;
    if (!data?.setup?.startDate) return;
    await ensureDataDir();
    const startDate = new Date(data.setup.startDate);
    if (Number.isNaN(startDate.getTime())) return;
    const summaryPath = getWeeklySummaryPath();
    let existing = [];
    try {
      const raw = await fs.readFile(summaryPath, 'utf-8');
      existing = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    const existingWeeks = new Set(existing.map((entry) => entry.weekIndex));
    const now = new Date();
    const daysSince = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const currentWeekIndex = Math.floor(daysSince / 7);
    const newEntries = [];

    for (let weekIndex = 0; weekIndex <= currentWeekIndex; weekIndex += 1) {
      if (existingWeeks.has(weekIndex)) continue;
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + weekIndex * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const logs = data.logs.filter((log) => {
        const timestamp = new Date(log.timestamp);
        return !log.deletedAt && timestamp >= weekStart && timestamp < weekEnd;
      });
      if (!logs.length) continue;
      const phValues = logs.flatMap((log) => log.plants.map((plant) => plant.ph)).filter((v) => v !== null);
      const ecValues = logs.flatMap((log) => log.plants.map((plant) => plant.ec)).filter((v) => v !== null);
      const tempValues = logs.flatMap((log) => log.plants.map((plant) => plant.waterTemp)).filter((v) => v !== null);
      const avgPh = average(phValues);
      const avgEc = average(ecValues);
      const avgTemp = average(tempValues);
      const stabilityIndex = calculateStabilityIndex(logs);
      newEntries.push({
        weekIndex,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        avgPh,
        avgEc,
        avgTemp,
        stabilityIndex
      });
    }

    if (newEntries.length) {
      const updated = [...existing, ...newEntries];
      await fs.writeFile(summaryPath, JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error(`Weekly summary update failed: ${error.message}`);
  }
}

function scheduleWeeklySummary() {
  updateWeeklySummary();
  setInterval(updateWeeklySummary, 6 * 60 * 60 * 1000);
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
  ipcMain.handle('dwc:nutrients', async () => loadNutrientDatabase());
  scheduleWeeklySummary();

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
