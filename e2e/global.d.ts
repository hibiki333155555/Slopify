import type { DesktopApi } from "../packages/shared/src/types/index.js";

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
