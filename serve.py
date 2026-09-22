#!/usr/bin/env python3
"""Static server for the app, plus a single write endpoint for her progress.

Two jobs:
  GET  anything   - serve the app, with caching switched off. The stock
                    http.server sends only Last-Modified, and the home-screen
                    icon loads ./index.html with no query string, so every
                    cache-buster missed the installed app and it stayed frozen.
  POST /sync      - the iPad posts its log here so the data can be read from
                    this machine without anyone copying and pasting.

Scope of the write endpoint, deliberately narrow:
  * /sync is the ONLY path that accepts a POST; everything else gets 404.
  * it writes exactly two files inside ./data, names fixed by this script -
    nothing in the request can choose a path.
  * bodies over 4 MB are refused.
  * reachable only from 192.168.1.0/24, because that is all the Windows
    firewall rule allows through.
"""
import functools, http.server, json, os, sys, datetime

ROOT = '/home/ps/priv/litery'
DATA = os.path.join(ROOT, 'data')
MAX  = 4 * 1024 * 1024

class Handler(http.server.SimpleHTTPRequestHandler):

    def guess_type(self, path):
        # SimpleHTTPRequestHandler sends 'application/json' with no charset, so
        # Safari decoded the payload as Latin-1 and every emoji came through as
        # mojibake when copied. Declare the encoding for anything textual.
        t = super().guess_type(path)
        base = t.split(';')[0].strip()
        if base.startswith('text/') or base in (
                'application/json', 'application/javascript', 'application/manifest+json'):
            return base + '; charset=utf-8'
        return t

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        if self.path.split('?')[0] != '/sync':
            self.send_error(404); return
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            self.send_error(400, 'bad length'); return
        if n <= 0 or n > MAX:
            self.send_error(413, 'body too large'); return

        raw = self.rfile.read(n)
        try:
            payload = json.loads(raw.decode('utf-8'))
        except Exception:
            self.send_error(400, 'not json'); return

        os.makedirs(DATA, exist_ok=True)
        rows = len(payload.get('log') or [])

        # Every sync gets its own snapshot, never overwritten. A device whose
        # storage was wiped posted an empty payload once and erased the only
        # server-side record of 59 attempts; a per-day filename was not enough.
        stamp = datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')
        with open(os.path.join(DATA, 'snapshot-%s.json' % stamp), 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)

        # latest.json only moves forward. A poorer payload is kept as a
        # snapshot but does not become the record.
        latest = os.path.join(DATA, 'latest.json')
        prev_rows = -1
        if os.path.exists(latest):
            try:
                with open(latest, encoding='utf-8') as f:
                    prev_rows = len(json.load(f).get('log') or [])
            except Exception:
                prev_rows = -1
        if rows >= prev_rows:
            with open(latest, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False)
        else:
            sys.stderr.write('sync: REFUSED to overwrite latest.json '
                             '(%d rows incoming vs %d on record)\n' % (rows, prev_rows))

        sys.stderr.write('sync: %d log rows, %d mastery items\n'
                         % (rows, len(payload.get('mastery') or {})))
        body = json.dumps({'ok': True, 'rows': rows}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))

http.server.ThreadingHTTPServer(
    ('0.0.0.0', 8000), functools.partial(Handler, directory=ROOT)
).serve_forever()
