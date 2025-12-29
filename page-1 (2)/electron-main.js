const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1080,
        height: 1920,
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Load the screensaver page as the entry point
    mainWindow.loadFile(path.join(__dirname, 'page-1', 'screensaver.html'));

    // Handle Silent Printing
    ipcMain.on('print-silent', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            // silent: true skips the dialog
            // printBackground: true ensures CSS backgrounds (colors/images) are printed
            win.webContents.print({ silent: true, printBackground: true }, (success, errorType) => {
                if (!success) console.log(errorType);
            });
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
