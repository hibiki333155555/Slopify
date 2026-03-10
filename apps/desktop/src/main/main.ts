import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, nativeImage, Notification } from "electron";
import { createLocalDb } from "./db.js";
import { registerIpcHandlers } from "./ipc.js";
import { DesktopRepository } from "./repository.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const APP_VERSION = (() => {
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim(); }
  catch { return "unknown"; }
})();

const resolveWindowIcon = (): string | undefined => {
  if (process.platform === "darwin") {
    return undefined;
  }

  const candidates = [
    path.join(app.getAppPath(), "build", "icon.png"),
    path.join(currentDir, "../../build/icon.png"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const createWindow = async (): Promise<void> => {
  const preloadPath = path.join(currentDir, "../preload/index.cjs");
  const iconPath = resolveWindowIcon();

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Slopify",
    ...(iconPath !== undefined ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.on("before-input-event", (_event, input) => {
    if (!input.control && !input.meta) return;
    const wc = window.webContents;
    if (input.key === "=" || input.key === "+") {
      wc.setZoomLevel(wc.getZoomLevel() + 0.5);
    } else if (input.key === "-") {
      wc.setZoomLevel(wc.getZoomLevel() - 0.5);
    } else if (input.key === "0") {
      wc.setZoomLevel(0);
    }
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
  const repository = new DesktopRepository(db, sqlite, APP_VERSION);

  registerIpcHandlers(repository);

  let unreadCount = 0;

  const makeBadgeIcon = (): Electron.NativeImage => {
    // Build a 16x16 red dot from raw RGBA pixels.
    // nativeImage.createFromDataURL does NOT support SVG, so we draw manually.
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist <= r) {
          const alpha = Math.min(1, Math.max(0, r - dist + 0.5));
          buf[i] = 239;     // R (#ef4444)
          buf[i + 1] = 68;  // G
          buf[i + 2] = 68;  // B
          buf[i + 3] = Math.round(alpha * 255);
        }
      }
    }
    return nativeImage.createFromBuffer(buf, { width: size, height: size });
  };

  const updateBadge = (): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (process.platform === "win32" || process.platform === "linux") {
        if (unreadCount > 0) {
          w.setOverlayIcon(makeBadgeIcon(), `${unreadCount} unread`);
          if (!w.isFocused()) w.flashFrame(true);
        } else {
          w.setOverlayIcon(null, "");
          w.flashFrame(false);
        }
      }
    }
    if (process.platform === "darwin") {
      app.setBadgeCount(unreadCount);
    }
  };

  repository.onVersionOutdated((latestVersion) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send("version-outdated", { latestVersion, currentVersion: APP_VERSION });
    }
  });

  repository.onNotification(({ title, body }) => {
    // OS notification (Windows/Mac) — fails silently on WSL2/Linux without notification daemon
    try { new Notification({ title, body }).show(); } catch { /* ignore */ }
    // Renderer notification (in-app toast + sound — works everywhere)
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send("notification", { title, body });
    }
    unreadCount++;
    updateBadge();
  });

  await repository.init();
  await createWindow();

  for (const w of BrowserWindow.getAllWindows()) {
    w.on("focus", () => {
      unreadCount = 0;
      updateBadge();
    });
  }

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
