"""
Kiosk Mode Application - Debug Version with Logging
Exit with: Press 'Q' key 5 times quickly
"""

import webview
import sys
import os
import threading
import time
from datetime import datetime
import win32print
import winreg  # For Windows Registry modifications

# Logging - saves to "logs" folder next to the exe
# Get the directory where the EXE is located
if getattr(sys, 'frozen', False):
    EXE_DIR = os.path.dirname(sys.executable)
else:
    EXE_DIR = os.path.dirname(os.path.abspath(__file__))

# Create logs folder next to exe
LOGS_FOLDER = os.path.join(EXE_DIR, "logs")
try:
    os.makedirs(LOGS_FOLDER, exist_ok=True)
except:
    LOGS_FOLDER = EXE_DIR  # Fallback to exe folder

# Log file with date stamp: logs_2025-12-09.txt
LOG_FILE = os.path.join(LOGS_FOLDER, f"logs_{datetime.now().strftime('%Y-%m-%d')}.txt")

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {msg}"
    print(log_line)
    sys.stdout.flush()
    
    # Write to log file
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_line + "\n")
    except Exception as e:
        print(f"[LOG ERROR] {e}")

# Print paths at startup
print("="*60)
print(f"EXE Location: {EXE_DIR}")
print(f"Logs Folder:  {LOGS_FOLDER}")
print(f"Log File:     {LOG_FILE}")
print("="*60)

log("=== KIOSK APP STARTING ===")

try:
    import keyboard
    log("keyboard library imported successfully")
except Exception as e:
    log(f"ERROR importing keyboard: {e}")
    keyboard = None


class PrinterAPI:
    """Simple API class for JavaScript - avoids recursion issues"""
    
    def __init__(self):
        self.selected_printer = None  # Will be set during startup
    
    def print_receipt_image(self, image_data_base64):
        """Print receipt as image - preserves design. Called from JavaScript with base64 image."""
        log("========== PRINT IMAGE RECEIPT ==========")
        try:
            import base64
            from PIL import Image
            import io
            
            printer_name = self.selected_printer
            if not printer_name:
                raise Exception("No printer selected!")
            
            log(f"Using printer: {printer_name}")
            
            # Decode base64 image
            image_bytes = base64.b64decode(image_data_base64.split(',')[1] if ',' in image_data_base64 else image_data_base64)
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to grayscale and resize for 80mm printer (max width ~576 pixels for 203dpi)
            image = image.convert('L')  # Grayscale
            max_width = 576
            if image.width > max_width:
                ratio = max_width / image.width
                new_height = int(image.height * ratio)
                image = image.resize((max_width, new_height), Image.LANCZOS)
            
            log(f"Image size: {image.width}x{image.height}")
            
            # Convert to ESC/POS bitmap format
            ESC = chr(27)
            GS = chr(29)
            
            # Build print data
            print_data = bytearray()
            print_data.extend((ESC + '@').encode())  # Initialize
            print_data.extend((ESC + 'a1').encode())  # Center align
            
            # Print image as raster bit image
            width_bytes = (image.width + 7) // 8
            
            for y in range(image.height):
                # GS v 0 - print raster bit image
                print_data.extend(b'\x1d\x76\x30\x00')
                print_data.append(width_bytes & 0xFF)
                print_data.append((width_bytes >> 8) & 0xFF)
                print_data.append(1)  # 1 row at a time
                print_data.append(0)
                
                row_data = bytearray()
                for x_byte in range(width_bytes):
                    byte_val = 0
                    for bit in range(8):
                        x = x_byte * 8 + bit
                        if x < image.width:
                            pixel = image.getpixel((x, y))
                            if pixel < 128:  # Dark pixel
                                byte_val |= (0x80 >> bit)
                    row_data.append(byte_val)
                print_data.extend(row_data)
            
            # Feed and cut
            print_data.extend(b'\n\n\n\n\n')
            print_data.extend((ESC + 'i').encode())  # Cut
            
            # Send to printer
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Kiosk Receipt Image", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, bytes(print_data))
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            
            log(f"✅ Image print sent to {printer_name}")
            return {"success": True, "message": f"Printed to {printer_name}"}
        except Exception as e:
            log(f"❌ Print image error: {e}")
            return {"success": False, "message": str(e)}
    
    def print_receipt(self, receipt_text=None):
        """Print thermal receipt - called from JavaScript with receipt content"""
        log("========== PRINT BUTTON CLICKED ==========")
        log("Printing thermal receipt...")
        try:
            # Use the selected printer
            printer_name = self.selected_printer
            if not printer_name:
                raise Exception("No printer selected! Please restart and select a printer.")
            
            log(f"Using printer: {printer_name}")
            
            # Use provided receipt text from webpage, or fallback to test receipt
            if receipt_text:
                log("Using receipt content from webpage")
                # Add ESC/POS commands for thermal printer
                ESC = chr(27)
                INIT = ESC + '@'
                LF = chr(10)
                final_text = INIT + receipt_text + LF + LF + LF + LF + ESC + 'i'
            else:
                log("No receipt text provided - using test receipt")
                final_text = self._make_receipt()
            
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Kiosk Receipt", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, final_text.encode('utf-8'))
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            
            log(f"✅ Print sent to {printer_name}")
            return {"success": True, "message": f"Printed to {printer_name}"}
        except Exception as e:
            log(f"❌ Print error: {e}")
            return {"success": False, "message": str(e)}
    
    def print_receipt_html(self, html_content):
        """Print receipt from HTML content - directly converts HTML to ESC/POS for thermal printing."""
        log("========== PRINT HTML RECEIPT ==========")
        try:
            import re
            from html.parser import HTMLParser
            
            printer_name = self.selected_printer
            if not printer_name:
                raise Exception("No printer selected! Please restart and select a printer.")
            
            log(f"Using printer: {printer_name}")
            log(f"HTML content length: {len(html_content)}")
            
            # Simple HTML to text converter
            class HTMLToText(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.lines = []
                    self.current_line = ""
                    self.in_script = False
                    self.in_style = False
                    self.bold = False
                    self.section_title = False
                    
                def handle_starttag(self, tag, attrs):
                    if tag in ['script', 'style']:
                        self.in_script = True if tag == 'script' else False
                        self.in_style = True if tag == 'style' else False
                    elif tag in ['br', 'hr']:
                        if self.current_line.strip():
                            self.lines.append(self.current_line.strip())
                        self.current_line = ""
                        if tag == 'hr':
                            self.lines.append("-" * 42)
                    elif tag in ['div', 'p']:
                        if self.current_line.strip():
                            self.lines.append(self.current_line.strip())
                        self.current_line = ""
                    elif tag in ['b', 'strong']:
                        self.bold = True
                    elif tag == 'span':
                        # Check class for styling hints
                        for attr_name, attr_val in attrs:
                            if attr_name == 'class':
                                if 'section-title' in attr_val or 'title' in attr_val:
                                    self.section_title = True
                    
                def handle_endtag(self, tag):
                    if tag in ['script', 'style']:
                        self.in_script = False
                        self.in_style = False
                    elif tag in ['div', 'p', 'h1', 'h2', 'h3', 'h4']:
                        if self.current_line.strip():
                            self.lines.append(self.current_line.strip())
                        self.current_line = ""
                    elif tag in ['b', 'strong']:
                        self.bold = False
                    elif tag == 'span':
                        self.section_title = False
                    
                def handle_data(self, data):
                    if not self.in_script and not self.in_style:
                        text = data.strip()
                        if text:
                            if self.current_line:
                                self.current_line += " " + text
                            else:
                                self.current_line = text
                
                def get_text(self):
                    if self.current_line.strip():
                        self.lines.append(self.current_line.strip())
                    return self.lines
            
            # Parse HTML
            parser = HTMLToText()
            parser.feed(html_content)
            text_lines = parser.get_text()
            
            log(f"Parsed {len(text_lines)} lines from HTML")
            
            # Build ESC/POS receipt
            ESC = chr(27)
            INIT = ESC + '@'
            CENTER = ESC + 'a1'
            LEFT = ESC + 'a0'
            BOLD_ON = ESC + 'E1'
            BOLD_OFF = ESC + 'E0'
            CUT = ESC + 'i'
            LF = chr(10)
            
            receipt = [INIT, CENTER]
            
            # Add TIMEZONE header
            receipt.append(BOLD_ON + "TIMEZONE" + BOLD_OFF)
            receipt.append("www.timezonegames.com")
            receipt.append("")
            receipt.append(LEFT)
            receipt.append("=" * 42)
            
            # Add parsed content
            for line in text_lines:
                # Skip empty display:none style artifacts
                if not line or line == "none" or line.startswith("display"):
                    continue
                # Clean up the line
                clean_line = re.sub(r'\s+', ' ', line).strip()
                if clean_line:
                    receipt.append(clean_line)
            
            # Add footer
            receipt.append("=" * 42)
            receipt.append(CENTER)
            receipt.append(BOLD_ON + "TERIMA KASIH!" + BOLD_OFF)
            receipt.append("")
            receipt.append(LF + LF + LF + LF)
            receipt.append(CUT)
            
            final_text = "\n".join(receipt)
            log(f"Final receipt text length: {len(final_text)}")
            
            # Send to printer
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Kiosk Receipt HTML", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, final_text.encode('utf-8'))
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            
            log(f"✅ HTML receipt printed to {printer_name}")
            return {"success": True, "message": f"Printed to {printer_name}"}
        except Exception as e:
            log(f"❌ Print HTML error: {e}")
            import traceback
            log(traceback.format_exc())
            return {"success": False, "message": str(e)}
    
    def _make_receipt(self):
        """Generate receipt text"""
        now = datetime.now()
        ESC = chr(27)
        INIT = ESC + '@'  # Initialize printer
        LF = chr(10)  # Line feed
        
        lines = [
            INIT,  # Initialize printer first
            ESC + 'a1',  # Center
            ESC + 'E1' + "TEST RECEIPT" + ESC + 'E0',
            "80mm Thermal Print Test",
            "Kiosk Application",
            ESC + 'a0',  # Left align
            "=" * 42,
            f"Date: {now.strftime('%Y-%m-%d %H:%M:%S')}",
            "-" * 42,
            "Test Item 1" + " " * 20 + "$10.00",
            "Test Item 2" + " " * 20 + "$25.00",
            "=" * 42,
            ESC + 'E1' + "TOTAL: $35.00" + ESC + 'E0',
            "=" * 42,
            ESC + 'a1',  # Center
            "THANK YOU!",
            "",
            "",
            LF + LF + LF + LF + LF,  # Feed paper (5 line feeds)
            ESC + 'd' + chr(5),  # Feed 5 lines
            ESC + 'i',  # Partial cut
        ]
        return "\n".join(lines)




# Global printer API instance
printer_api = PrinterAPI()


def configure_kiosk_mode():
    """Configure Windows 10 for kiosk mode - disable edge swipes and gestures"""
    log("Configuring Windows 10 kiosk mode...")
    
    try:
        # Disable Edge Swipe (for touch screens)
        key_path = r"SOFTWARE\Policies\Microsoft\Windows\EdgeUI"
        try:
            key = winreg.CreateKey(winreg.HKEY_LOCAL_MACHINE, key_path)
            winreg.SetValueEx(key, "AllowEdgeSwipe", 0, winreg.REG_DWORD, 0)
            winreg.CloseKey(key)
            log("Edge swipe disabled")
        except PermissionError:
            log("[WARNING] No admin - edge swipe NOT disabled")
        except Exception as e:
            log(f"[WARNING] Edge swipe config failed: {e}")
        
        # Disable Action Center (multiple locations for better blocking)
        # Location 1: Policy for all users
        key_path = r"SOFTWARE\Policies\Microsoft\Windows\Explorer"
        try:
            key = winreg.CreateKey(winreg.HKEY_LOCAL_MACHINE, key_path)
            winreg.SetValueEx(key, "DisableNotificationCenter", 0, winreg.REG_DWORD, 1)
            winreg.CloseKey(key)
            log("Action Center disabled (HKLM Policy)")
        except PermissionError:
            log("[WARNING] No admin - action center HKLM NOT disabled")
        except Exception as e:
            log(f"[WARNING] Action center HKLM failed: {e}")
        
        # Location 2: Current user
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
            winreg.SetValueEx(key, "DisableNotificationCenter", 0, winreg.REG_DWORD, 1)
            winreg.CloseKey(key)
            log("Action Center disabled (HKCU)")
        except Exception as e:
            log(f"[WARNING] Action center HKCU failed: {e}")
        
        # Location 3: Additional blocking via Settings
        key_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications"
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
            winreg.SetValueEx(key, "ToastEnabled", 0, winreg.REG_DWORD, 0)
            winreg.CloseKey(key)
            log("Notifications/toasts disabled")
        except Exception as e:
            log(f"[WARNING] Toast config failed: {e}")
        
        # Force Group Policy refresh to apply immediately
        import subprocess
        try:
            subprocess.run(["gpupdate", "/force"], capture_output=True, timeout=10)
            log("Group Policy refreshed")
        except:
            log("[WARNING] Could not refresh Group Policy")
        
        # Auto-hide taskbar (prevent swipe from bottom revealing it)
        key_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ | winreg.KEY_WRITE)
            # Get current settings
            try:
                settings = winreg.QueryValueEx(key, "Settings")[0]
                # Modify byte 8 to enable auto-hide (set bit 0)
                settings_list = list(settings)
                if len(settings_list) > 8:
                    settings_list[8] = settings_list[8] | 0x01  # Set auto-hide bit
                    winreg.SetValueEx(key, "Settings", 0, winreg.REG_BINARY, bytes(settings_list))
                    log("Taskbar auto-hide enabled")
            except:
                log("[WARNING] Could not modify taskbar settings")
            winreg.CloseKey(key)
        except PermissionError:
            log("[WARNING] No permission - taskbar NOT hidden")
        except Exception as e:
            log(f"[WARNING] Taskbar config failed: {e}")
            
        log("Kiosk mode configured")
        
    except Exception as e:
        log(f"[WARNING] Kiosk config error: {e}")


def restore_windows_settings():
    """Restore Windows settings when kiosk closes"""
    log("Restoring Windows settings...")
    try:
        # Re-enable Edge Swipe
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Policies\Microsoft\Windows\EdgeUI", 0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, "AllowEdgeSwipe")
            winreg.CloseKey(key)
        except:
            pass
        
        # Re-enable Action Center
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Policies\Microsoft\Windows\Explorer", 0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, "DisableNotificationCenter")
            winreg.CloseKey(key)
        except:
            pass
            
        log("Windows settings restored")
    except Exception as e:
        log(f"[WARNING] Restore error: {e}")


def select_printer():
    """Show printer selection menu in CMD before kiosk starts"""
    import sys
    
    # Check for command line argument: --printer "Printer Name"
    if len(sys.argv) > 2 and sys.argv[1] == '--printer':
        printer_name = sys.argv[2]
        log(f"Printer specified via command line: {printer_name}")
        return printer_name
    
    # Check for command line argument: --default (skip selection, use default)
    if len(sys.argv) > 1 and sys.argv[1] == '--default':
        try:
            default_printer = win32print.GetDefaultPrinter()
            log(f"Using default printer (--default flag): {default_printer}")
            return default_printer
        except:
            return None
    
    print("\n" + "=" * 60)
    print("       KIOSK PRINTER CONFIGURATION")
    print("=" * 60)
    
    # Get available printers
    try:
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        printers = win32print.EnumPrinters(flags)
        printer_list = [p[2] for p in printers]
    except Exception as e:
        print(f"\n[ERROR] Error getting printers: {e}")
        printer_list = []
    
    if not printer_list:
        print("\n[WARNING] No printers found!")
        print("Using default printer...")
        try:
            return win32print.GetDefaultPrinter()
        except:
            return None
    
    # Show printer list
    default_printer = win32print.GetDefaultPrinter()
    print("\nAvailable Printers:\n")
    
    for idx, printer in enumerate(printer_list, 1):
        marker = " <- DEFAULT" if printer == default_printer else ""
        thermal = " [THERMAL]" if '80mm' in printer.lower() or 'pos' in printer.lower() else ""
        print(f"   {idx}. {printer}{marker}{thermal}")
    
    print(f"\n   0. Use default ({default_printer})")
    print("\n" + "-" * 60)
    print("\nTIP: Run with --default to skip this menu")
    print("     Run with --printer \"Printer Name\" to specify printer")
    
    # Get user selection
    while True:
        try:
            choice = input("\n>> Enter printer number (0 for default): ").strip()
            
            if choice == "" or choice == "0":
                selected = default_printer
                break
            
            num = int(choice)
            if 1 <= num <= len(printer_list):
                selected = printer_list[num - 1]
                break
            else:
                print(f"[ERROR] Invalid number. Enter 0-{len(printer_list)}")
        except ValueError:
            print("[ERROR] Please enter a valid number")
        except KeyboardInterrupt:
            print("\n\n[WARNING] Cancelled. Using default printer.")
            selected = default_printer
            break
        except RuntimeError as e:
            # Handle "lost sys.stdin" error - use default printer
            log(f"[WARNING] stdin not available: {e}")
            print("\n[WARNING] No console input available. Using default printer.")
            selected = default_printer
            break
    
    print(f"\n[OK] Selected: {selected}")
    print("=" * 60)
    print("\nStarting Kiosk Application...")
    print("   (Press Q five times to exit)\n")
    
    return selected


class KioskApp:
    def __init__(self):
        self.window = None
        self.running = True
        self.q_press_count = 0
        self.last_q_time = 0
        log("KioskApp initialized")
    
    def print_receipt(self):
        """Print thermal receipt - called from HTML"""
        log("========== PRINT BUTTON CLICKED ==========")
        log("Printing thermal receipt...")
        try:
            # Find thermal printer (prefer 80mm Series Printer)
            printer_name = self._find_thermal_printer()
            if not printer_name:
                raise Exception("No thermal printer found or printer is offline")
            
            log(f"Using printer: {printer_name}")
            receipt_text = self._generate_receipt_text()
            
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                # Check printer status
                printer_info = win32print.GetPrinter(hPrinter, 2)
                status = printer_info.get('Status', 0)
                
                if status != 0:  # 0 = Ready
                    # Common status codes:
                    # 0x00000001 = Paused
                    # 0x00000002 = Error
                    # 0x00000004 = Pending Deletion
                    # 0x00000008 = Paper Jam
                    # 0x00000010 = Paper Out
                    # 0x00000020 = Manual Feed
                    # 0x00000040 = Paper Problem
                    # 0x00000080 = Offline
                    if status & 0x00000080:
                        raise Exception("Printer is OFFLINE. Please turn on the printer.")
                    elif status & 0x00000010:
                        raise Exception("Printer is OUT OF PAPER")
                    elif status & 0x00000008:
                        raise Exception("PAPER JAM detected")
                    else:
                        raise Exception(f"Printer error (status: {status})")
                
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Kiosk Receipt", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, receipt_text.encode('utf-8'))
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            
            log(f"✅ Print sent to {printer_name}")
            return {"success": True, "message": f"Printed to {printer_name}"}
        except Exception as e:
            log(f"❌ Print error: {e}")
            return {"success": False, "message": str(e)}
    
    def _find_thermal_printer(self):
        """Find thermal printer, prefer 80mm Series Printer"""
        try:
            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            printers = win32print.EnumPrinters(flags)
            
            # First, try to find 80mm Series Printer
            for printer in printers:
                printer_name = printer[2]
                if '80mm' in printer_name.lower() or 'series' in printer_name.lower():
                    log(f"Found thermal printer: {printer_name}")
                    return printer_name
            
            # Fallback to default printer
            default = win32print.GetDefaultPrinter()
            log(f"Using default printer: {default}")
            return default
            
        except Exception as e:
            log(f"Error finding printer: {e}")
            return None
    
    def _generate_receipt_text(self):
        """Generate receipt content with ESC/POS commands"""
        now = datetime.now()
        txn_id = f"TXN-{now.strftime('%Y%m%d%H%M%S')}"
        
        ESC = chr(27)
        CENTER = ESC + 'a1'
        LEFT = ESC + 'a0'
        BOLD_ON = ESC + 'E1'
        BOLD_OFF = ESC + 'E0'
        CUT = ESC + 'i'
        
        receipt = []
        receipt.append(CENTER)
        receipt.append(BOLD_ON + "TEST RECEIPT" + BOLD_OFF)
        receipt.append("Thermal Printer Test - 80mm")
        receipt.append("Kiosk Application")
        receipt.append("Sample Business Name")
        receipt.append(LEFT)
        receipt.append("=" * 42)
        receipt.append(f"Transaction ID: {txn_id}")
        receipt.append(f"Date: {now.strftime('%m/%d/%Y')}")
        receipt.append(f"Time: {now.strftime('%H:%M:%S')}")
        receipt.append("-" * 42)
        receipt.append(BOLD_ON + "ITEMS PURCHASED:" + BOLD_OFF)
        receipt.append("")
        receipt.append("Test Item 1" + " " * 20 + "$10.00")
        receipt.append("Test Item 2 x 2" + " " * 15 + "$25.00")
        receipt.append("Test Item 3" + " " * 20 + "$15.50")
        receipt.append("-" * 42)
        receipt.append("Subtotal:" + " " * 25 + "$50.50")
        receipt.append("Tax (8%):" + " " * 25 + "$4.04")
        receipt.append("=" * 42)
        receipt.append(BOLD_ON + "TOTAL:" + " " * 28 + "$54.54" + BOLD_OFF)
        receipt.append("=" * 42)
        receipt.append("Payment Method:" + " " * 18 + "CASH")
        receipt.append("Amount Paid:" + " " * 21 + "$60.00")
        receipt.append("Change:" + " " * 27 + "$5.46")
        receipt.append("")
        receipt.append(CENTER)
        receipt.append(BOLD_ON + "THANK YOU!" + BOLD_OFF)
        receipt.append("")
        receipt.append(f"Printed: {now.strftime('%Y-%m-%d %H:%M:%S')}")
        receipt.append("")
        receipt.append("")
        receipt.append(CUT)
        
        return "\n".join(receipt)
    
    def close_app(self):
        """Close the application"""
        log(">>> CLOSING APP <<<")
        self.running = False
        if keyboard:
            try:
                keyboard.unhook_all()
            except:
                pass
        if self.window:
            try:
                self.window.destroy()
            except:
                pass
        log("Exiting...")
        # Don't use os._exit(0) - let it exit normally so CMD stays open
    
    def on_key_event(self, event):
        """Handle key events"""
        try:
            log(f"Key pressed: {event.name}, scan_code: {event.scan_code}")
            
            # Exit: Press Q 5 times within 2 seconds
            if event.name == 'q' and event.event_type == 'down':
                current_time = time.time()
                if current_time - self.last_q_time < 2:
                    self.q_press_count += 1
                else:
                    self.q_press_count = 1
                self.last_q_time = current_time
                
                log(f"Q pressed {self.q_press_count}/5 times")
                
                if self.q_press_count >= 5:
                    self.close_app()
        except Exception as e:
            log(f"Error in key handler: {e}")
    
    def setup_keyboard(self):
        """Setup keyboard hooks"""
        if not keyboard:
            log("WARNING: keyboard library not available!")
            return
        
        try:
            # Hook all keys to monitor
            keyboard.hook(self.on_key_event)
            log("Keyboard hook installed")
            
            # Try to block keys (requires admin)
            try:
                keyboard.block_key('left windows')
                keyboard.block_key('right windows')
                log("Windows keys blocked")
            except Exception as e:
                log(f"Could not block Windows keys: {e}")
            
            try:
                # Block Alt+Tab by blocking tab when alt is pressed
                keyboard.add_hotkey('alt+tab', lambda: None, suppress=True)
                log("Alt+Tab suppressed")
            except Exception as e:
                log(f"Could not suppress Alt+Tab: {e}")
                
        except Exception as e:
            log(f"Error setting up keyboard: {e}")
    
    def get_html_content(self):
        return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Kiosk</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
            touch-action: none !important;
            -ms-touch-action: none !important;
            -webkit-touch-callout: none;
        }

        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            touch-action: none !important;
        }

        .container {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
            position: fixed;
            top: 0;
            left: 0;
        }

        h1 {
            font-size: 5rem;
            font-weight: 300;
            color: #fff;
            text-shadow: 0 0 20px rgba(255,255,255,0.3);
            font-family: 'Segoe UI', sans-serif;
            animation: pulse 2s ease-in-out infinite;
        }

        .print-btn {
            position: fixed;
            bottom: 80px;
            right: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
            transition: all 0.3s ease;
            font-family: 'Segoe UI', sans-serif;
            z-index: 99999;
        }

        .print-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 28px rgba(102, 126, 234, 0.6);
        }

        .print-btn:active {
            transform: translateY(0);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .hint {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255,255,255,0.3);
            font-size: 12px;
            font-family: 'Segoe UI', sans-serif;
        }

        /* Block all pointer events for multi-touch */
        .touch-blocker {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            touch-action: none;
            pointer-events: auto;
        }
    </style>
</head>
<body>
    <div class="touch-blocker" id="touchBlocker"></div>
    <div class="container">
        <h1>Test Text</h1>
    </div>
    <button class="print-btn" onclick="printReceipt()">🖨️ Print Receipt</button>
    <div class="hint">Press Q five times quickly to exit</div>

    <script>
        // Comprehensive touch blocking
        const blocker = document.getElementById('touchBlocker');
        
        // Block ALL touch events
        ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(evt => {
            blocker.addEventListener(evt, function(e) {
                // Only allow single touch
                if (e.touches && e.touches.length > 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    console.log('Blocked multi-touch:', e.touches.length);
                    return false;
                }
            }, { passive: false, capture: true });
            
            document.addEventListener(evt, function(e) {
                if (e.touches && e.touches.length > 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }, { passive: false, capture: true });
            
            window.addEventListener(evt, function(e) {
                if (e.touches && e.touches.length > 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }, { passive: false, capture: true });
        });

        // Block pointer events (for newer touch APIs)
        ['pointerdown', 'pointermove', 'pointerup'].forEach(evt => {
            document.addEventListener(evt, function(e) {
                if (e.pointerType === 'touch' && e.isPrimary === false) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }, { passive: false, capture: true });
        });

        // Block gesture events (Safari)
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
            document.addEventListener(evt, function(e) {
                e.preventDefault();
                return false;
            }, { passive: false });
        });

        // Disable right-click
        document.addEventListener('contextmenu', e => {
            e.preventDefault();
            return false;
        });

        // Block keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Allow Q key for exit
            if (e.key === 'q' || e.key === 'Q') {
                return;
            }
            
            // Block everything else that's dangerous
            if (e.key === 'F11' || e.key === 'Escape' ||
                e.altKey || e.metaKey ||
                (e.ctrlKey && (e.key === 'w' || e.key === 'W' || e.key === 'Tab'))) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { capture: true });

        // Prevent drag
        document.addEventListener('dragstart', e => {
            e.preventDefault();
            return false;
        });

        // Keep focus
        window.addEventListener('blur', () => {
            window.focus();
        });

        // Log for debugging
        console.log('Kiosk HTML loaded, touch blocking active');

        // Print receipt function
        async function printReceipt() {
            console.log('Print button clicked');
            
            // Check if pywebview API is available
            if (typeof pywebview === 'undefined' || !pywebview.api) {
                alert('❌ Error: Print API not ready. Please wait and try again.');
                console.error('pywebview.api not available');
                return;
            }
            
            // Show loading indicator
            const btn = document.querySelector('.print-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳ Printing...';
            btn.disabled = true;
            
            try {
                console.log('Calling pywebview.api.print_receipt()...');
                const result = await pywebview.api.print_receipt();
                console.log('Print result:', result);
                
                if (result && result.success) {
                    alert('✅ Receipt sent to printer!');
                } else {
                    alert('❌ Print failed: ' + (result ? result.message : 'Unknown error'));
                }
            } catch (error) {
                console.error('Print error:', error);
                alert('❌ Print error: ' + error.message);
            } finally {
                // Restore button
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
        
        // Log when API is ready
        window.addEventListener('pywebviewready', function() {
            console.log('pywebview API is ready!');
        });
    </script>
</body>
</html>'''
    
    def run(self):
        """Run the kiosk application"""
        log("Setting up keyboard...")
        self.setup_keyboard()
        
        # Load kiosk-shell.html from local page-1 folder
        # Determine the base path (different for frozen exe vs development)
        if getattr(sys, 'frozen', False):
            # Running as compiled exe
            # PyInstaller extracts bundled data to sys._MEIPASS
            bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
            base_path = bundle_dir
            log(f"Running as frozen exe, bundle dir: {bundle_dir}")
        else:
            # Running as script - use script directory
            base_path = os.path.dirname(os.path.abspath(__file__))
            log(f"Running as script, base path: {base_path}")
        
        # Path to page-1 folder containing kiosk-shell.html
        page1_path = os.path.join(base_path, 'page-1')
        if not os.path.exists(page1_path):
            # Check _internal folder (PyInstaller 6.0+ one-folder mode)
            internal_path = os.path.join(base_path, '_internal', 'page-1')
            if os.path.exists(internal_path):
                 page1_path = internal_path
                 log(f"Found page-1 in _internal: {page1_path}")
            else:
                # Try alternate location (page-1 (2)/page-1 structure) for dev mode
                alt_path = os.path.join(base_path, 'page-1 (2)', 'page-1')
                if os.path.exists(alt_path):
                    page1_path = alt_path
                log(f"Checking alternate path: {alt_path}")
        
        log(f"Using page-1 folder: {page1_path}")
        
        start_file = os.path.join(page1_path, 'kiosk-shell.html')
        log(f"Looking for kiosk-shell.html at: {start_file}")
        
        if os.path.exists(start_file):
            start_url = f"file:///{start_file.replace(os.sep, '/')}"
            log(f"Loading local file: {start_url}")
        else:
            log(f"ERROR: kiosk-shell.html not found at {start_file}")
            # List directory to help debug
            try:
                log(f"Contents of base_path: {os.listdir(base_path)[:10]}")
            except:
                pass
            # Fallback - try to load from any available location
            start_url = f"file:///{start_file.replace(os.sep, '/')}"
        
        log("Creating kiosk window...")
        self.window = webview.create_window(
            title='Kiosk',
            url=start_url,
            fullscreen=True,
            frameless=True,
            easy_drag=False,
            on_top=True,
            focus=True,
            js_api=printer_api,
        )
        
        # Add event handler for when page loads - re-expose API and override print
        def on_loaded():
            log("Page loaded event triggered")
            try:
                # Inject JavaScript - block right-click, override print to use thermal printer directly
                js_code = """
                (function() {
                    console.log('=== KIOSK MODE LOADED ===');
                    
                    // Block right-click context menu
                    document.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        return false;
                    }, true);
                    console.log('Right-click context menu disabled');
                    
                    // Override window.print() to extract HTML and print directly to thermal printer
                    var originalPrint = window.print.bind(window);
                    window.print = async function() {
                        console.log('=== PRINT INTERCEPTED (Direct HTML Method) ===');
                        console.log('pywebview:', typeof pywebview);
                        console.log('pywebview.api:', pywebview && pywebview.api);
                        
                        // Check if pywebview API is available
                        if (typeof pywebview === 'undefined' || !pywebview.api) {
                            console.error('pywebview API not available');
                            alert('Print API not ready. Please wait and try again.');
                            return;
                        }
                        
                        // Find the print receipt element - look for .print-receipt first, then .receipt
                        var receiptElement = document.querySelector('.print-receipt');
                        if (!receiptElement) {
                            receiptElement = document.querySelector('.receipt');
                        }
                        if (!receiptElement) {
                            receiptElement = document.querySelector('.preview-ticket');
                        }
                        
                        console.log('Receipt element found:', !!receiptElement);
                        
                        if (!receiptElement) {
                            console.error('No receipt element found');
                            alert('No receipt content found to print.');
                            return;
                        }
                        
                        try {
                            // Extract text content from receipt for thermal printing
                            var receiptHTML = receiptElement.innerHTML;
                            console.log('Receipt HTML length:', receiptHTML.length);
                            
                            // Call Python API to print the receipt HTML directly
                            if (pywebview.api.print_receipt_html) {
                                console.log('Calling print_receipt_html...');
                                var result = await pywebview.api.print_receipt_html(receiptHTML);
                                console.log('Print result:', JSON.stringify(result));
                                if (result && !result.success) {
                                    alert('Print error: ' + result.message);
                                } else if (result && result.success) {
                                    console.log('PRINT SUCCESS!');
                                }
                            } else {
                                console.error('print_receipt_html method not found');
                                alert('Print method not available.');
                            }
                        } catch (error) {
                            console.error('Print error:', error);
                            alert('Print error: ' + error.message);
                        }
                    };
                    console.log('Direct HTML print override active - No system print dialog');
                })();
                """
                self.window.evaluate_js(js_code)
                log("Successfully injected print override (Direct HTML method)")
            except Exception as e:
                log(f"Error injecting JS: {e}")
        
        self.window.events.loaded += on_loaded
        
        log("Starting webview...")
        
        # WebView2 startup settings to prevent hanging on some systems:
        # - Disable GPU hardware acceleration to avoid graphics driver issues
        # - Use a dedicated private mode to avoid cache/profile conflicts
        webview2_settings = {
            'private_mode': False,  # Use normal mode for better compatibility
        }
        
        try:
            # Try starting with GPU acceleration disabled (fixes hangs on some laptops)
            webview.start(
                debug=True,  # Enable debug mode to see console
                http_server=False,  # Don't start HTTP server
                gui='edgechromium',  # Force Edge WebView2
                # private_mode=False,  # Normal mode
            )
        except Exception as e:
            log(f"ERROR: WebView failed to start: {e}")
            import traceback
            log(traceback.format_exc())


if __name__ == '__main__':
    log("Script started")
    log(f"Running as admin: {os.name == 'nt' and __import__('ctypes').windll.shell32.IsUserAnAdmin()}")
    
    # Step 0: Configure Windows kiosk mode
    configure_kiosk_mode()
    
    # Step 1: Select printer in CMD
    selected_printer = select_printer()
    printer_api.selected_printer = selected_printer
    log(f"Printer configured: {selected_printer}")
    
    # Step 2: Start kiosk app
    app = KioskApp()
    app.run()
    
    # Restore Windows settings
    restore_windows_settings()
    
    # Keep CMD open after app closes
    log("========== APP CLOSED ==========")
    log(f"Log file saved to: {LOG_FILE}")
    print("\n" + "="*50)
    print("Press ENTER to close this window...")
    print("="*50)
    input()


