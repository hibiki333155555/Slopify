// apps/desktop/src/core/native.ts
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export const showNotification = async (title: string, body: string): Promise<void> => {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }
  if (permissionGranted) {
    sendNotification({ title: `Slopify — ${title}`, body });
  }
};

export const getSystemIdleTime = async (): Promise<number> => {
  return await invoke<number>("get_system_idle_time");
};

export const readClipboardImage = async (): Promise<string | null> => {
  return await invoke<string | null>("read_clipboard_image");
};
