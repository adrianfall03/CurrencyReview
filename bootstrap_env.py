#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Bootstrap a local venv and install required dependencies.
Usage:
  python bootstrap_env.py
  python bootstrap_env.py --with-pyinstaller
  python bootstrap_env.py --upgrade
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
import venv


DEFAULT_REQUIREMENTS = [
    "pandas",
    "pywebview",
]


def _venv_paths(venv_dir: Path) -> tuple[Path, Path]:
    if os.name == "nt":
        python_exe = venv_dir / "Scripts" / "python.exe"
        pip_exe = venv_dir / "Scripts" / "pip.exe"
    else:
        python_exe = venv_dir / "bin" / "python"
        pip_exe = venv_dir / "bin" / "pip"
    return python_exe, pip_exe


def _run(cmd: list[str]) -> None:
    print(">>", " ".join(cmd))
    subprocess.check_call(cmd)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create venv and install dependencies.")
    parser.add_argument("--with-pyinstaller", action="store_true", help="Install PyInstaller as well.")
    parser.add_argument("--upgrade", action="store_true", help="Upgrade pip and packages.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    venv_dir = root / ".venv"
    requirements_txt = root / "requirements.txt"

    if not venv_dir.exists():
        print(f"Creating venv at: {venv_dir}")
        venv.EnvBuilder(with_pip=True, clear=False, upgrade=False).create(venv_dir)
    else:
        print(f"Using existing venv: {venv_dir}")

    python_exe, pip_exe = _venv_paths(venv_dir)
    if not pip_exe.exists():
        raise FileNotFoundError(f"pip not found at {pip_exe}")

    # Upgrade pip if requested
    if args.upgrade:
        _run([str(pip_exe), "install", "--upgrade", "pip"])

    if requirements_txt.exists():
        print(f"Installing from {requirements_txt.name}")
        cmd = [str(pip_exe), "install", "-r", str(requirements_txt)]
        if args.upgrade:
            cmd.append("--upgrade")
        _run(cmd)
    else:
        reqs = list(DEFAULT_REQUIREMENTS)
        if args.with_pyinstaller:
            reqs.append("pyinstaller")
        cmd = [str(pip_exe), "install"] + reqs
        if args.upgrade:
            cmd.append("--upgrade")
        _run(cmd)

    print("\nDone.")
    print("Run the app with:")
    if os.name == "nt":
        print(rf"  {python_exe} fx_gui.py")
    else:
        print(f"  {python_exe} fx_gui.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
