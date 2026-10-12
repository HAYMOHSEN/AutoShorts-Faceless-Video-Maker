"""Builds AutoShorts.zip for upload to GitHub (excludes development folders).
Run from the project folder:  python3 tools/package.py"""
import os, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(os.path.dirname(ROOT), 'AutoShorts.zip')
EXCLUDE_DIRS = {'_dev', '.git', '__pycache__'}

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    count = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith('.'))
        for f in sorted(filenames):
            if f.startswith('.'):
                continue
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, ROOT)
            z.write(full, os.path.join('AutoShorts', rel))
            count += 1
print(f'{OUT}: {count} files, {os.path.getsize(OUT) / 1e6:.1f} MB')
