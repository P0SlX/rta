import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  setTitle: (title: string) => ipcRenderer.send("set-title", title),
  openFileDialog: () => ipcRenderer.invoke("dialog:openFiles"),
});
