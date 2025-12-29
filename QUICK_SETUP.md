# Quick Setup Guide - Kiosk with Thermal Printing

## 🚀 Quick Start

### Step 1: Disable Touch Gestures (One-time setup)

**Right-click `DISABLE_TOUCH_GESTURES.bat` → Run as administrator**

This will disable 3-finger and 4-finger touch gestures that could break kiosk mode.

⚠️ **Important**: Log out and log back in after running this script.

---

### Step 2: Run the Kiosk

**Double-click `dist\KioskApp.exe`**

The app will:
- ✅ Launch in full-screen kiosk mode
- ✅ Auto-detect your "80mm Series Printer"
- ✅ Show a print button in the bottom-right

---

### Step 3: Print a Test Receipt

**Click the purple "🖨️ Print Receipt" button**

The app will:
- ✅ Check if printer is online
- ✅ Print silently (no dialog)
- ✅ Show success/error message

---

## ⚠️ Troubleshooting

### Printer is Offline

**Error**: "Printer is OFFLINE. Please turn on the printer."

**Fix**:
1. Turn on your 80mm Series Printer
2. Check USB/network connection
3. Wait a few seconds for Windows to detect it
4. Try printing again

---

### Printer Not Found

**Error**: "No thermal printer found or printer is offline"

**Fix**:
1. Go to **Settings** → **Printers & scanners**
2. Make sure "80mm Series Printer" is listed
3. Set it as the **default printer** if needed
4. Restart the kiosk app

---

### Out of Paper

**Error**: "Printer is OUT OF PAPER"

**Fix**:
1. Load thermal paper (80mm width)
2. Try printing again

---

## 🔧 Files Reference

| File | Purpose |
|------|---------|
| `dist\KioskApp.exe` | Main kiosk application |
| `DISABLE_TOUCH_GESTURES.bat` | Disable 3-finger gestures |
| `thermal_printer.py` | Standalone print script |
| `print_test_80mm.html` | Web-based print test |
| `README_TOUCH_GESTURES.md` | Detailed gesture blocking guide |

---

## 🎯 Exit Kiosk

**Press Q five times quickly** to exit the kiosk.

---

## 📸 Screenshot

![Your printer setup](file:///C:/Users/Pranesh/.gemini/antigravity/brain/c9c057f9-935a-4352-87c1-b42053dde4e4/uploaded_image_1765266160351.png)

*Your "80mm Series Printer" will be automatically detected by the kiosk app.*
