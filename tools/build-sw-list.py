"""Regenerates the APP_SHELL list in sw.js from the files in the project.
Run from the project folder before publishing:  python3 tools/build-sw-list.py
Large files (the voice engine runtime) are cached on first use instead of at install."""
import os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SKIP_DIRS = {'tools', '_dev', '.git', 'screenshots', 'store'}
SKIP_FILES = {'sw.js', 'README.md', 'LICENSES.md'}
# fetched on first use and kept in the runtime cache: the voice engines and the phonemizer for
# the non-English voices
LAZY = ('vendor/kokoro.web.js', 'vendor/ort/', 'vendor/espeak/', 'icons/icon-1024.png')

files = ['./', './index.html']
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.')]
    for f in sorted(filenames):
        rel = os.path.relpath(os.path.join(dirpath, f), ROOT).replace(os.sep, '/')
        if rel in SKIP_FILES or f.startswith('.') or rel.endswith(('.py', '.txt', '.md')):
            continue
        if rel.startswith(LAZY):
            continue
        if rel == 'index.html':
            continue
        files.append('./' + rel)

sw_path = os.path.join(ROOT, 'sw.js')
sw = open(sw_path, encoding='utf-8').read()
block = '\n' + '\n'.join(f"  '{p}'," for p in files) + '\n'
sw = re.sub(r'/\*APP_SHELL_START\*/.*?/\*APP_SHELL_END\*/', '/*APP_SHELL_START*/' + block + '/*APP_SHELL_END*/', sw, flags=re.S)
open(sw_path, 'w', encoding='utf-8').write(sw)
print(f'{len(files)} files in the app shell')
