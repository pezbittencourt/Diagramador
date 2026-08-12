import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("livroStudio", {
  platform: process.platform,
  version: "0.1.0",
});

