import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, nativeImage, Notification } from "electron";
import { createLocalDb } from "./db.js";
import { registerIpcHandlers } from "./ipc.js";
import { DesktopRepository } from "./repository.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

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
  const repository = new DesktopRepository(db, sqlite);

  registerIpcHandlers(repository);

  let unreadCount = 0;

  const makeBadgeIcon = (count: number): Electron.NativeImage => {
    const size = 16;
    const label = count > 99 ? "99+" : String(count);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ef4444"/>
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
        font-family="sans-serif" font-size="${count > 99 ? 7 : count > 9 ? 8 : 10}" font-weight="bold" fill="white">${label}</text>
    </svg>`;
    return nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    );
  };

  const updateBadge = (): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (unreadCount > 0) {
        w.setOverlayIcon(makeBadgeIcon(unreadCount), `${unreadCount} unread`);
      } else {
        w.setOverlayIcon(null, "");
      }
    }
    if (process.platform === "darwin") {
      app.setBadgeCount(unreadCount);
    }
  };

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
