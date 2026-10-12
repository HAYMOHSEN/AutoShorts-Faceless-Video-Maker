"""Builds two zips next to the project folder:
  AutoShorts.zip               the app, for upload to GitHub (no development files, no Store images)
  AutoShorts-Store-Listing.zip English listing and screenshots, every translated listing text and
                               the Store logos, for Partner Center
  AutoShorts-Store-<Language>.zip  one per other language: its listing text and its screenshots
Run from the project folder:  python3 tools/package.py"""
import os, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PARENT = os.path.dirname(ROOT)
EXCLUDE_DIRS = {'_dev', '.git', '__pycache__'}
STORE_IMAGES = {os.path.join('store', 'screenshots'), os.path.join('store', 'logos')}


def build_app():
    out = os.path.join(PARENT, 'AutoShorts.zip')
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            rel_dir = os.path.relpath(dirpath, ROOT)
            dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith('.') and os.path.normpath(os.path.join(rel_dir, d)) not in STORE_IMAGES)
            for f in sorted(filenames):
                if f.startswith('.'):
                    continue
                full = os.path.join(dirpath, f)
                z.write(full, os.path.join('AutoShorts', os.path.relpath(full, ROOT)))
                count += 1
    print(f'{out}: {count} files, {os.path.getsize(out) / 1e6:.1f} MB')


LANG_SETS = {'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt-BR': 'Portuguese', 'hi': 'Hindi', 'ar': 'Arabic'}


def add(z, full, arc):
    z.write(full, arc)
    return 1


def build_listing():
    """AutoShorts-Store-Listing.zip: the English listing and screenshots, every translated listing
    text and the Store logos. Each other language's screenshots go in a zip of their own
    (AutoShorts-Store-Spanish.zip, ...) with that language's listing text, so every download stays
    small."""
    store = os.path.join(ROOT, 'store')
    pngs = lambda folder: sorted(f for f in os.listdir(folder) if f.lower().endswith('.png')) if os.path.isdir(folder) else []
    out = os.path.join(PARENT, 'AutoShorts-Store-Listing.zip')
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as z:
        count += add(z, os.path.join(store, 'STORE-LISTING.md'), 'AutoShorts-Store-Listing/STORE-LISTING.md')
        listings = os.path.join(store, 'listings')
        for f in sorted(os.listdir(listings)) if os.path.isdir(listings) else []:
            if f.endswith('.md'):
                count += add(z, os.path.join(listings, f), f'AutoShorts-Store-Listing/listings/{f}')
        for sub in ('screenshots', 'logos'):
            folder = os.path.join(store, sub)
            for f in pngs(folder):
                count += add(z, os.path.join(folder, f), f'AutoShorts-Store-Listing/{sub}/{f}')
    print(f'{out}: {count} files, {os.path.getsize(out) / 1e6:.1f} MB')
    for code, name in LANG_SETS.items():
        folder = os.path.join(store, 'screenshots', code)
        if not pngs(folder):
            continue
        out = os.path.join(PARENT, f'AutoShorts-Store-{name}.zip')
        top = f'AutoShorts-Store-{name}'
        count = 0
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as z:
            md = os.path.join(store, 'listings', f'{code}.md')
            if os.path.exists(md):
                count += add(z, md, f'{top}/listings/{code}.md')
            for f in pngs(folder):
                count += add(z, os.path.join(folder, f), f'{top}/screenshots/{code}/{f}')
        print(f'{out}: {count} files, {os.path.getsize(out) / 1e6:.1f} MB')


build_app()
build_listing()
