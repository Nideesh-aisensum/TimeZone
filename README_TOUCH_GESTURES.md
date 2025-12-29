# Disabling Touch Gestures for Kiosk Mode

## Problem
Windows 10/11 allows users to perform system actions with multi-touch gestures:
- **3 fingers**: Open Task View, switch apps
- **4 fingers**: Switch desktops, minimize windows
- **Edge swipes**: Open Action Center, Task View, notifications

These gestures can break kiosk mode and allow users to exit the application.

## Solution

### Method 1: Registry Changes (Recommended)

**Run the automated script:**
1. Right-click `DISABLE_TOUCH_GESTURES.bat`
2. Select **"Run as administrator"**
3. Press any key to confirm
4. **Log out and log back in** for changes to take effect

**What it does:**
- ✅ Disables 3-finger tap and swipe
- ✅ Disables 4-finger tap and swipe  
- ✅ Disables edge swipe gestures
- ✅ Disables tablet mode auto-switch
- ✅ Disables Windows Ink workspace

### Method 2: Group Policy (Windows Pro/Enterprise only)

1. Press `Win + R`, type `gpedit.msc`, press Enter
2. Navigate to:
   ```
   Computer Configuration 
   → Administrative Templates 
   → Windows Components 
   → Edge UI
   ```
3. Enable these policies:
   - "Turn off switching between recent apps"
   - "Disable help tips"
   - "Turn off edge swipe"

### Method 3: Windows Settings

1. Open **Settings** → **Devices** → **Touchpad**
2. Under "Three-finger gestures", set to **Nothing**
3. Under "Four-finger gestures", set to **Nothing**

⚠️ Note: This only works for touchpads, not touchscreens

---

## Verification

After applying the changes:

1. **Log out and log back in**
2. Try 3-finger gestures on the touchscreen
3. They should no longer work

---

## Re-enabling Gestures

To re-enable touch gestures later:

1. Delete or rename `disable_touch_gestures.reg`
2. Create a new file `enable_touch_gestures.reg`:
   ```reg
   Windows Registry Editor Version 5.00

   [HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad]
   "ThreeFingerTapEnabled"=dword:00000001
   "ThreeFingerSlideEnabled"=dword:00000001
   "FourFingerTapEnabled"=dword:00000001
   "FourFingerSlideEnabled"=dword:00000001
   ```
3. Double-click to apply
4. Log out and log back in

---

## For Kiosk Deployment

**Before deploying the kiosk:**
1. Run `DISABLE_TOUCH_GESTURES.bat` as administrator
2. Log out and log back in
3. Launch `KioskApp.exe`
4. Test that touch gestures don't work

**Additional Security:**
- Set up Windows in "Kiosk Mode" or "Assigned Access"
- Disable Task Manager (`Ctrl+Shift+Esc`)
- Use a dedicated Windows account with limited permissions
