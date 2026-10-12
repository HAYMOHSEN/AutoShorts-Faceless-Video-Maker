"""Lists every interface string the code translates — t('…'), tx('…') and N_('…') — and checks
the translation files in js/i18n/ against it.

  python3 tools/extract-i18n.py            # report missing / unused keys per language
  python3 tools/extract-i18n.py --json     # print the keys (with where they are used) as JSON
"""
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
JS = os.path.join(ROOT, 'js')
# a call of t / tx / N_ that isn't a method (x.t), but may be spread (...tx)
CALL = re.compile(r"""(?:(?<=\.\.\.)|(?<![\w.$]))(t|tx|N_)\(\s*(['"])((?:\\.|(?!\2).)*)\2""", re.S)
TEMPLATE = re.compile(r"""(?:(?<=\.\.\.)|(?<![\w.$]))(t|tx|N_)\(\s*`""")


def unescape(s, q):
    return s.replace('\\' + q, q).replace('\\n', '\n').replace("\\'", "'").replace('\\\\', '\\')


def scan():
    keys = {}
    problems = []
    for f in sorted(os.listdir(JS)):
        if not f.endswith('.js'):
            continue
        src = open(os.path.join(JS, f), encoding='utf-8').read()
        # whole-line comments hold examples, not interface strings (keep the line count for locations)
        src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
        for m in CALL.finditer(src):
            key = unescape(m.group(3), m.group(2))
            line = src.count('\n', 0, m.start()) + 1
            keys.setdefault(key, []).append(f'{f}:{line}')
        for m in TEMPLATE.finditer(src):
            line = src.count('\n', 0, m.start()) + 1
            problems.append(f'{f}:{line} template literal passed to {m.group(1)}()')
    return keys, problems


def load_dict(lang):
    """Reads js/i18n/<lang>.js (export default { 'key': 'value' | {one, other…} })."""
    path = os.path.join(JS, 'i18n', f'{lang}.js')
    if not os.path.exists(path):
        return None
    src = open(path, encoding='utf-8').read()
    body = src[src.index('export default') + len('export default'):].strip().rstrip(';')
    import subprocess
    out = subprocess.run(['node', '-e', f'process.stdout.write(JSON.stringify({body}))'], capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f'{lang}.js does not parse: {out.stderr[:400]}')
    return json.loads(out.stdout)


def placeholders(s):
    if isinstance(s, dict):
        return set().union(*(placeholders(v) for v in s.values()))
    return set(re.findall(r'\{(\w+)\}', s))


if __name__ == '__main__':
    keys, problems = scan()
    if '--json' in sys.argv:
        print(json.dumps([{'key': k, 'used': v} for k, v in keys.items()], ensure_ascii=False, indent=1))
        sys.exit(0)
    print(f'{len(keys)} strings in the code')
    for p in problems:
        print('  !', p)
    for lang in ['es', 'fr', 'de', 'pt', 'hi', 'ar']:
        d = load_dict(lang)
        if d is None:
            print(f'{lang}: no translation file')
            continue
        missing = [k for k in keys if k not in d]
        unused = [k for k in d if k not in keys]
        bad = [k for k in keys if k in d and placeholders(d[k]) - placeholders(k) - {'n'}]
        lost = [k for k in keys if k in d and (placeholders(k) - {'n'}) - placeholders(d[k])]
        print(f'{lang}: {len(d)} translated, {len(missing)} missing, {len(unused)} unused, {len(bad)} unknown placeholders, {len(lost)} dropped placeholders')
        for k in missing[:20]:
            print('   missing:', k[:100])
        for k in bad[:10]:
            print('   unknown placeholder in:', k[:80], '→', str(d[k])[:80])
        for k in lost[:10]:
            print('   dropped placeholder in:', k[:80], '→', str(d[k])[:80])
