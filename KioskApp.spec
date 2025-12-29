# -*- mode: python ; coding: utf-8 -*-

import os

# Page-1 folder with all assets - will be placed next to the EXE
page1_folder = 'page-1 (2)/page-1'

# Build list of data files from page-1 folder
datas = []
if os.path.exists(page1_folder):
    for root, dirs, files in os.walk(page1_folder):
        for file in files:
            src = os.path.join(root, file)
            # Destination path preserves structure inside 'page-1'
            rel_path = os.path.relpath(root, page1_folder)
            if rel_path == '.':
                dst = 'page-1'
            else:
                dst = os.path.join('page-1', rel_path)
            datas.append((src, dst))
    print(f"Including {len(datas)} files from page-1 folder")
else:
    print(f"WARNING: page-1 folder not found at {page1_folder}")

a = Analysis(
    ['kiosk_app.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=['PIL', 'PIL.Image'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

# NOT using --onefile mode - this creates a folder with exe + assets
# This is MUCH better for large media files
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='KioskApp',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Console for printer selection
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# Collect all files into dist folder
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='KioskApp',
)
