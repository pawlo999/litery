"""The letter sounds recorded under the family key (record.html in Pisz;
Litery and Pisz both play them) — read only. For each take: how long it is,
how much of it is voiced (a pitch you could hum: vowels, m, n, l, w), and
how much is hiss (s, sz, f). A vowel with little voiced time, a held
consonant shorter than ~0.3 s, or a short one with long voicing is worth a
listen. Loudness and clipping are not shown: record.html levels every take
(peak at most 0.95, the same average loudness) before it uploads, so they
say nothing about the take. Never prints the key.

    python3 tools/recordings.py

Key: the file named by $LITERY_KEY_FILE, else ~/priv/litery/sync/key.txt.
The sounds live on the Pisz sync service (/a/<key>/<lang>/<letter>).
"""
import datetime, json, math, os, struct, urllib.error, urllib.parse, urllib.request

key_file = os.environ.get('LITERY_KEY_FILE', os.path.expanduser('~/priv/litery/sync/key.txt'))
KEY = urllib.parse.quote(open(key_file).read().strip(), safe='')
BASE = 'https://pisz-sync.pawlo999.workers.dev/a/'
H = {'User-Agent': 'curl/8'}
ALPHABET = {'pl': 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż', 'nb': 'abcdefghijklmnopqrstuvwxyzæøå'}
# what the sound should be like (Polish): a vowel is voiced throughout; a
# short consonant is a burst; a held one is a long hiss or hum
KIND = {'pl': {}}
for c in 'a ą e ę i o ó u y'.split(): KIND['pl'][c] = 'vowel'
for c in 'b c ć d g k p t'.split(): KIND['pl'][c] = 'short'
for c in 'f h j l ł m n ń r s ś w z ź ż'.split(): KIND['pl'][c] = 'held'

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=20) as r:
        return r.read()

def samples(b):
    """16-bit mono PCM from a WAV, chunks found by tag (not a fixed header)"""
    if b[:4] != b'RIFF' or b[8:12] != b'WAVE':
        raise ValueError('not a WAV')
    i, sr, data = 12, None, None
    while i + 8 <= len(b):
        tag, size = b[i:i + 4], struct.unpack('<I', b[i + 4:i + 8])[0]
        body = b[i + 8:i + 8 + size]
        if tag == b'fmt ':
            ch, sr, bits = struct.unpack('<H', body[2:4])[0], struct.unpack('<I', body[4:8])[0], struct.unpack('<H', body[14:16])[0]
            if ch != 1 or bits != 16:
                raise ValueError('%d channels, %d bits' % (ch, bits))
        elif tag == b'data':
            data = body
        i += 8 + size + (size & 1)
    if not sr or data is None:
        raise ValueError('no fmt or data chunk')
    n = len(data) // 2
    return sr, [v / 32767 for v in struct.unpack('<%dh' % n, data[:2 * n])]

def measure(sr, x):
    """ms voiced (periodic at 80-400 Hz) and ms of hiss, in 10 ms steps"""
    k = max(1, round(sr / 7350))                       # periodicity on a ~7 kHz copy, for speed
    y = [sum(x[i:i + k]) / k for i in range(0, len(x) - k + 1, k)]
    sy = sr / k
    win, hop = int(sy * 0.03), max(1, int(sy * 0.01))
    lo, hi = int(sy / 400), int(sy / 80)
    hop_x, fl_x = int(sr * 0.01), int(sr * 0.03)
    frames = []
    for f, j in enumerate(range(0, len(y) - win - hi + 1, hop)):
        seg = y[j:j + win + hi]
        a = seg[:win]
        e = math.sqrt(sum(v * v for v in a) / win)
        ea, best = sum(p * p for p in a), 0
        for L in range(lo, hi + 1):
            b = seg[L:L + win]
            den = math.sqrt(ea * sum(q * q for q in b)) or 1
            best = max(best, sum(p * q for p, q in zip(a, b)) / den)
        xs = x[f * hop_x:f * hop_x + fl_x]
        zc = sum(1 for m in range(1, len(xs)) if (xs[m] >= 0) != (xs[m - 1] >= 0)) / (len(xs) / sr) if len(xs) > 1 else 0
        frames.append((e, best, zc))
    if not frames:
        return 0, 0
    mx = max(e for e, _, _ in frames) or 1
    loud = [fr for fr in frames if fr[0] > mx * 0.15]
    voiced = sum(1 for e, r, zc in loud if r > 0.5) * 10
    hiss = sum(1 for e, r, zc in loud if r <= 0.5 and zc >= 3000) * 10
    return voiced, hiss

ix = json.loads(get(BASE + KEY))
print('languages:', {l: len(v) for l, v in ix.items()})
print('lang letter kind    sec voiced_ms hiss_ms recorded(UTC)')
for lang, letters in sorted(ix.items()):
    order = ALPHABET.get(lang, '')
    for c in sorted(letters, key=lambda c: (order.find(c) if c in order else 99, c)):
        at = letters[c]
        when = datetime.datetime.fromtimestamp(at / 1000, datetime.UTC).strftime('%m-%d %H:%M')
        kind = KIND.get(lang, {}).get(c, '?')
        try:
            sr, x = samples(get(BASE + KEY + '/' + lang + '/' + urllib.parse.quote(c) + '?v=' + str(at)))
            voiced, hiss = measure(sr, x)
            print('%-4s %-6s %-6s %4.2f %9d %7d %s' % (lang, c, kind, len(x) / sr, voiced, hiss, when))
        except (urllib.error.URLError, ValueError, struct.error) as e:
            print('%-4s %-6s %-6s unreadable: %s %s' % (lang, c, kind, e, when))
