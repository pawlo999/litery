"""Her Litery record from the sync service — read only (GET). Saves the full
reply OUTSIDE any git checkout (her record must never land in a public repo)
and prints rows per day and one day's rows in order. Never prints the key;
her name, wherever a row holds it, prints as "(name)".

    python3 tools/her-log.py [YYYY-MM-DD] [--out PATH]

Key: the file named by $LITERY_KEY_FILE, else ~/priv/litery/sync/key.txt.
Default --out: ~/.cache/litery/her-log.json. Times are UTC. A reply with no
rows at all (a wrong or changed key gets an empty record, not an error)
keeps the copy saved before and exits with an error.
"""
import datetime, json, os, re, subprocess, sys, urllib.parse, urllib.request


def refuse_inside_a_checkout(out):
    """Her record must never land where `git add` could pick it up: refuse
    any path inside a git checkout (this repo, its worktrees, any other
    repo) unless that checkout ignores it. Fails closed: if git cannot say,
    nothing is written. The same guard sits in pisz/tools/her-log.py and
    litery/tools/her-log.py — change both (their tests run it)."""
    probe = out
    while not os.path.isdir(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            break
        probe = parent
    top = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=probe, capture_output=True, text=True)
    if top.returncode != 0:
        if 'not a git repository' in top.stderr:
            return
        sys.exit('cannot tell whether %s is inside a git checkout (%s) — refusing' % (out, top.stderr.strip()))
    ignored = subprocess.run(['git', 'check-ignore', '-q', out], cwd=probe, capture_output=True, text=True)
    if ignored.returncode == 0:
        return
    sys.exit('refusing to write her record inside the git checkout %s (not ignored there): %s' % (top.stdout.strip(), out))


# the arguments first: nothing is fetched for a typo
args = sys.argv[1:]
out = os.path.expanduser('~/.cache/litery/her-log.json')
if '--out' in args:
    i = args.index('--out')
    if i + 1 >= len(args):
        sys.exit('--out needs a path')
    out = args[i + 1]
    del args[i:i + 2]
bad = [a for a in args if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', a)]
if bad or len(args) > 1:
    sys.exit(__doc__.strip().split('\n\n')[1] + '\n(day as YYYY-MM-DD; not understood: ' + ' '.join(bad or args[1:]) + ')')
out = os.path.realpath(os.path.expanduser(out))
refuse_inside_a_checkout(out)

key_file = os.environ.get('LITERY_KEY_FILE', os.path.expanduser('~/priv/litery/sync/key.txt'))
KEY = open(key_file).read().strip()
req = urllib.request.Request('https://litery-sync.pawlo999.workers.dev/s/' + urllib.parse.quote(KEY, safe=''),
                             headers={'User-Agent': 'curl/8'})
d = json.loads(urllib.request.urlopen(req, timeout=20).read())
log = d.get('log', [])
if not log:
    sys.exit('the service has no rows under this key (a wrong or changed key gets an empty record) — %s left as it was' % out)
os.makedirs(os.path.dirname(out), exist_ok=True)
tmp = out + '.part'
json.dump(d, open(tmp, 'w'))
os.replace(tmp, out)

name = d.get('name') if isinstance(d.get('name'), str) else ''
whole = re.compile(r'(?<!\w)' + re.escape(name) + r'(?!\w)', re.I) if name else None
def masked(v):
    """her name, as a whole word in any value, becomes (name); keys are left alone"""
    if isinstance(v, str):
        return whole.sub('(name)', v) if whole else v
    if isinstance(v, dict):
        return {k: masked(x) for k, x in v.items()}
    if isinstance(v, list):
        return [masked(x) for x in v]
    return v

utc = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC)
print('saved', len(log), 'rows to', out, '| updated', utc(d.get('updated', 0)).strftime('%Y-%m-%d %H:%M UTC'),
      '| settings', json.dumps(masked(d.get('settings')), ensure_ascii=False))
days = {}
for r in log:
    k = utc(r['t']).strftime('%Y-%m-%d')
    days[k] = days.get(k, 0) + 1
print('rows per day (UTC):', dict(sorted(days.items())))
day = args[0] if args else utc(max(r['t'] for r in log)).strftime('%Y-%m-%d')
rows = [r for r in log if utc(r['t']).strftime('%Y-%m-%d') == day]
print('---', day, 'UTC:', len(rows), 'rows')
for r in rows:
    print(utc(r['t']).strftime('%H:%M:%S'), json.dumps(masked({k: v for k, v in r.items() if k != 't'}), ensure_ascii=False))
