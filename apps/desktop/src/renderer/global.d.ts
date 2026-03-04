import type { DesktopApi } from "@slopify/shared";

declare global {
  interface Window {
    projectLog: DesktopApi;
  }
}

export {};
