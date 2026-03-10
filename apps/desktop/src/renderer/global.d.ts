import type { DesktopApi } from "@slopify/shared";

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
  const __APP_VERSION__: string;
}

export {};
