import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { createLocalDb } from "./db.js";
import { registerIpcHandlers } from "./ipc.js";
import { DesktopRepository } from "./repository.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const createWindow = async (): Promise<void> => {
  const preloadPath = path.join(currentDir, "../preload/index.cjs");

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Slopify",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl !== undefined && devUrl.length > 0) {
    await window.loadURL(devUrl);
  } else {
    const htmlPath = path.join(currentDir, "../renderer/index.html");
    await window.loadFile(htmlPath);
  }
};

const bootstrap = async (): Promise<void> => {
  const customUserData = process.env.SLOPIFY_USER_DATA_DIR;
  if (customUserData !== undefined && customUserData.length > 0) {
    app.setPath("userData", customUserData);
  }

  await app.whenReady();

  const userDataDir = app.getPath("userData");
  const { db, sqlite } = createLocalDb(userDataDir);
  const repository = new DesktopRepository(db, sqlite);

  registerIpcHandlers(repository);
  await repository.init();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
};

void bootstrap();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
