"""
Simple Direct Thermal Printer - 80mm
Prints directly without showing print dialog
"""

import win32print
import win32ui
import win32con
from datetime import datetime
import os


def print_text_receipt(printer_name=None):
    """
    Print a text-based receipt directly to thermal printer
    Uses ESC/POS commands for thermal printers
    """
    if printer_name is None:
        printer_name = win32print.GetDefaultPrinter()
    
    # Generate receipt content
    now = datetime.now()
    txn_id = f"TXN-{now.strftime('%Y%m%d%H%M%S')}"
    
    # ESC/POS commands
    ESC = chr(27)
    CENTER = ESC + 'a1'  # Center alignment
    LEFT = ESC + 'a0'    # Left alignment
    BOLD_ON = ESC + 'E1'  # Bold on
    BOLD_OFF = ESC + 'E0' # Bold off
    CUT = ESC + 'i'      # Cut paper (if supported)
    
    # Build receipt content
    receipt = []
    receipt.append(CENTER)
    receipt.append(BOLD_ON + "TEST RECEIPT" + BOLD_OFF)
    receipt.append("Thermal Printer Test - 80mm")
    receipt.append("Sample Business Name")
    receipt.append("123 Test Street, City, State 12345")
    receipt.append("Tel: (555) 123-4567")
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
    receipt.append("=" * 42)
    receipt.append(CENTER)
    receipt.append("")
    receipt.append(BOLD_ON + "THANK YOU FOR YOUR PURCHASE!" + BOLD_OFF)
    receipt.append("")
    receipt.append("This is a test print for 80mm thermal paper")
    receipt.append("Visit us at: www.example.com")
    receipt.append("-" * 42)
    receipt.append("Font Test: ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    receipt.append("0123456789 !@#$%^&*()")
    receipt.append("-" * 42)
    receipt.append(f"Printed: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    receipt.append("")
    receipt.append("")
    receipt.append("")  # Extra spacing before cut
    receipt.append(CUT)  # Cut command
    
    # Join all lines
    receipt_text = "\n".join(receipt)
    
    # Print directly
    try:
        # Open printer
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            # Start document
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("Thermal Receipt", None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                # Send data
                win32print.WritePrinter(hPrinter, receipt_text.encode('utf-8'))
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        
        print(f"✅ Print job sent to {printer_name}")
        return True
        
    except Exception as e:
        print(f"❌ Error printing: {e}")
        return False


def list_printers():
    """List all available printers"""
    printers = []
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    for printer in win32print.EnumPrinters(flags):
        printers.append(printer[2])
    return printers


def main():
    """Main function"""
    print("=" * 50)
    print("80mm Thermal Printer - Silent Print Test")
    print("=" * 50)
    
    default_printer = win32print.GetDefaultPrinter()
    print(f"\n📄 Default Printer: {default_printer}")
    
    print("\n🖨️  Available Printers:")
    printers = list_printers()
    for idx, printer in enumerate(printers, 1):
        marker = " ← DEFAULT" if printer == default_printer else ""
        print(f"  {idx}. {printer}{marker}")
    
    print("\n" + "=" * 50)
    choice = input("\nUse default printer? (y/n): ").strip().lower()
    
    selected_printer = default_printer
    if choice != 'y':
        try:
            printer_num = int(input("Enter printer number: ")) - 1
            if 0 <= printer_num < len(printers):
                selected_printer = printers[printer_num]
                print(f"✓ Selected: {selected_printer}")
            else:
                print("Invalid number, using default")
        except:
            print("Invalid input, using default")
    
    print(f"\n🖨️  Sending print job to: {selected_printer}")
    print("⏳ Please wait...")
    
    if print_text_receipt(selected_printer):
        print("\n✅ SUCCESS! Check your thermal printer.")
        print("💡 The receipt should print automatically without dialog.")
    else:
        print("\n❌ FAILED! Please check:")
        print("  - Printer is powered on")
        print("  - Printer is connected")
        print("  - Paper is loaded")
        print("  - Printer driver is installed")
    
    input("\nPress Enter to exit...")


if __name__ == '__main__':
    main()
