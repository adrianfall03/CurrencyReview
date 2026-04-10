# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

block_cipher = None

pywebview_datas, pywebview_binaries, pywebview_hidden = collect_all("pywebview")
ui_datas = [
    ("ui/index.html", "ui"),
    ("ui/style.css", "ui"),
    ("ui/app.js", "ui"),
]

a = Analysis(
    ["fx_gui.py"],
    pathex=["."],
    binaries=pywebview_binaries,
    datas=pywebview_datas + ui_datas,
    hiddenimports=pywebview_hidden + ["clr_loader", "pythonnet"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="app",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="app",
)
