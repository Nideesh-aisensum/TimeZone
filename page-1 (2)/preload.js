const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    print: () => ipcRenderer.send('print-silent'),
    exitKiosk: () => ipcRenderer.send('exit-kiosk')
});
