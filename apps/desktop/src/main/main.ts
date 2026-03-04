import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { initializeLocalDatabase } from "./db.js";
import { registerIpcHandlers } from "./ipc.js";
import { LocalRepository } from "./repository.js";
import { DesktopSyncClient } from "./sync-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const customUserDataDir = process.env.SLOPIFY_USER_DATA_DIR;
if (customUserDataDir && customUserDataDir.trim().length > 0) {
  app.setPath("userData", customUserDataDir);
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl).catch(() => undefined);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html")).catch(() => undefined);
  }
}

app.whenReady().then(() => {
  const localDb = initializeLocalDatabase(app.getPath("userData"));
  const repository = new LocalRepository(localDb.sqlite, localDb.orm);
  const syncClient = new DesktopSyncClient(repository, (payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("sync:updated", payload);
  });

  registerIpcHandlers(repository, syncClient);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
