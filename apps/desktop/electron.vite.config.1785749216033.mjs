// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "/home/rasiknizam/project/Rasik-Studio/apps/desktop";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "electron/main/index.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "electron/preload/index.ts")
      }
    }
  },
  renderer: {
    root: ".",
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "index.html")
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
