import type { DesktopApi } from "@slopify/shared";

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
