const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
const SERVER_URL = 'http://localhost:3000';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1080,
        height: 1920,
        fullscreen: true,
        kiosk: true,              // True kiosk mode - locks to fullscreen
        frame: false,             // Remove window frame/title bar
        autoHideMenuBar: true,    // Hide menu bar (File, Edit, etc.)
        alwaysOnTop: true,        // Keep window on top - prevents gesture minimize
        show: false, // Don't show until loaded
        backgroundColor: '#1a1a2e', // Dark background while loading
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Prevent minimize/blur from OS gestures (3-finger swipe etc.)
    mainWindow.on('minimize', () => {
        console.log('[Kiosk] Minimize blocked - restoring');
        mainWindow.restore();
        mainWindow.setFullScreen(true);
        mainWindow.setAlwaysOnTop(true);
    });

    mainWindow.on('blur', () => {
        // Re-focus after a brief delay (handles Task View gesture)
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.focus();
                mainWindow.setAlwaysOnTop(true);
            }
        }, 100);
    });

    mainWindow.on('leave-full-screen', () => {
        console.log('[Kiosk] Left fullscreen - restoring');
        mainWindow.setFullScreen(true);
    });

    // Load from the server (which serves kiosk-shell.html)
    console.log('Loading:', SERVER_URL);
    mainWindow.loadURL(SERVER_URL);

    // Show window once content is loaded
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Page loaded successfully');

        // Inject CSS to prevent text selection at Electron level
        mainWindow.webContents.insertCSS(`
            * {
                -webkit-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
                cursor: default !important;
                -webkit-user-drag: none !important;
            }
            input, textarea {
                -webkit-user-select: text !important;
                user-select: text !important;
            }
            img, video, canvas, svg {
                pointer-events: none !important;
                -webkit-user-drag: none !important;
            }
        `);

        // Inject JavaScript to block selection events
        mainWindow.webContents.executeJavaScript(`
            // Block all selection
            document.addEventListener('selectstart', (e) => e.preventDefault(), true);
            document.addEventListener('dragstart', (e) => e.preventDefault(), true);
            document.addEventListener('drop', (e) => e.preventDefault(), true);
            
            // Clear any existing selection periodically
            setInterval(() => {
                if (window.getSelection) {
                    window.getSelection().removeAllRanges();
                }
            }, 100);
            
            // Block copy/cut
            document.addEventListener('copy', (e) => e.preventDefault(), true);
            document.addEventListener('cut', (e) => e.preventDefault(), true);
            
            console.log('[Kiosk] Selection prevention active');
        `);

        mainWindow.show();
    });

    // Disable dev tools completely
    mainWindow.webContents.on('devtools-opened', () => {
        mainWindow.webContents.closeDevTools();
    });

    // Block context menu (right-click)
    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault();
    });

    // Handle load failures - retry after delay
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.log(`Load failed (${errorCode}): ${errorDescription}`);
        console.log('Retrying in 2 seconds...');
        setTimeout(() => {
            console.log('Retrying load...');
            mainWindow.loadURL(SERVER_URL);
        }, 2000);
    });

    // Handle Silent Printing
    ipcMain.on('print-silent', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.webContents.print({ silent: true, printBackground: true }, (success, errorType) => {
                if (!success) console.log(errorType);
            });
        }
    });

    // Handle Kiosk Exit (triggered by multi-tap corner gesture)
    ipcMain.on('exit-kiosk', () => {
        console.log('[Kiosk] Exit gesture detected - closing application');
        app.quit();
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
