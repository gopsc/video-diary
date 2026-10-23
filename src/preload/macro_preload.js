const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diaryApi', {
  saveVideo: (buffer, filename) => ipcRenderer.invoke('save-video', buffer, filename),
  listVideos: () => ipcRenderer.invoke('list-videos'),
  getVideoPath: (filename) => ipcRenderer.invoke('get-video-path', filename)
});