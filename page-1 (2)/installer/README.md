# Timezone Kiosk Web Installer

A lightweight web installer (~3-5 MB) that downloads all components during installation.

## What Gets Downloaded During Installation

| Component | Source | Size |
|-----------|--------|------|
| PostgreSQL 17 | postgresql.org | ~300 MB |
| Node.js 22 LTS | nodejs.org | ~30 MB |
| Kiosk App | Your Google Cloud | ~50 MB |

**Note:** If PostgreSQL or Node.js are already installed, they will be skipped.

---

## Setup Instructions

### Step 1: Install Inno Setup 6

Download and install from: https://jrsoftware.org/isdl.php

### Step 2: Create Your App Icon

1. Create or obtain a `.ico` file for the desktop shortcut
2. Save it as `installer/assets/timezone-icon.ico`

You can convert PNG to ICO at: https://convertico.com/

### Step 3: Upload Your Kiosk App to Google Cloud Storage

#### A. Create a ZIP of your kiosk app

```powershell
# In PowerShell, from the page-1 (2) folder:
Compress-Archive -Path "page-1", "server.js", "package.json", "package-lock.json", "db.js", ".env", "nulshock" -DestinationPath "timezone-kiosk-app.zip"
```

#### B. Upload to Google Cloud Storage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Storage** > **Buckets**
3. Create a bucket (or use existing one)
4. Upload `timezone-kiosk-app.zip`
5. Click on the file > **Edit access** > Add **allUsers** with **Reader** role (for public access)
   - Or use signed URLs for private access

6. Copy the public URL:
   ```
   https://storage.googleapis.com/YOUR_BUCKET_NAME/timezone-kiosk-app.zip
   ```

### Step 4: Update the Installer Script

Edit `TimezoneKiosk-WebInstaller.iss` and update line 24:

```iss
#define KioskApp_URL "https://storage.googleapis.com/YOUR_BUCKET_NAME/timezone-kiosk-app.zip"
```

### Step 5: Build the Installer

1. Open **Inno Setup Compiler**
2. File > Open > Select `TimezoneKiosk-WebInstaller.iss`
3. Build > Compile (or press F9)
4. Find your installer at: `installer/output/TimezoneKiosk-WebSetup-1.0.0.exe`

---

## Folder Structure

```
installer/
├── TimezoneKiosk-WebInstaller.iss   <- Main installer script
├── scripts/
│   ├── START_KIOSK.bat              <- Launcher script
│   ├── START_KIOSK.vbs              <- Silent launcher (no command window)
│   ├── STOP_KIOSK.bat               <- Stop all kiosk processes
│   └── create_database.bat          <- Creates PostgreSQL database
├── assets/
│   └── timezone-icon.ico            <- Desktop shortcut icon (YOU NEED TO ADD THIS)
└── output/
    └── (generated installer goes here)
```

---

## What the Installer Does

1. **Welcome Screen** - Shows what will be installed
2. **Choose Install Location** - Default: `C:\Program Files\Timezone Kiosk`
3. **Download Progress** - Downloads components with progress bar
4. **Install PostgreSQL** - Silent installation (only if not present)
5. **Install Node.js** - Silent installation (only if not present)
6. **Extract Kiosk App** - Unzips to install directory
7. **Create Database** - Creates TimeZone PostgreSQL database
8. **Install Dependencies** - Runs `npm install`
9. **Create Shortcuts** - Desktop and Start Menu
10. **Launch Option** - Optionally start the app

---

## Testing

Before distributing, test on a clean Windows machine:

1. Run `TimezoneKiosk-WebSetup-1.0.0.exe`
2. Follow the wizard
3. Verify downloads complete
4. Check PostgreSQL is installed and running
5. Check database exists
6. Double-click desktop shortcut
7. Verify kiosk launches correctly

---

## Troubleshooting

### Download fails
- Check internet connection
- Verify Google Cloud Storage URL is correct and publicly accessible
- Check firewall settings

### PostgreSQL installation fails
- Run installer as Administrator
- Check if port 5433 is available
- Check Windows Event Log for errors

### App doesn't start
- Check if server.js is in the install directory
- Verify npm install completed
- Check Node.js is in system PATH

---

## Updating the App

To release an update:

1. Create new ZIP of your app
2. Upload to Google Cloud Storage (same or new filename)
3. Update version in `.iss` file
4. Rebuild installer
5. Distribute new installer

---

## Size Comparison

| Installer Type | Size |
|---------------|------|
| ❌ Bundled (everything included) | ~400 MB |
| ✅ **Web Installer** | **~3-5 MB** |
