# tools — looking at her record and the recorded sounds

Read-only scripts. They are not tests: they print what is there.

| Script | What it answers |
|---|---|
| `her-log.py [YYYY-MM-DD]` | downloads her Litery record (read only) to `~/.cache/litery/her-log.json`; prints when the iPad last synced, rows per day and one day's rows in order |
| `recordings.py` | every letter sound recorded under the family key (`record.html` in Pisz; both apps play them): length, voiced time (a pitch you could hum) and hiss time. A vowel with little voicing, a held consonant under ~0.3 s or a short one with long voicing is worth a listen. Loudness and clipping are not shown: `record.html` levels every take before uploading, so they say nothing |

**Her record stays out of every git checkout.** `her-log.py` refuses any path
inside one — this repo, its worktrees, Pisz or any other — unless that checkout
ignores the path (Litery's own `data/` is ignored for her data), and refuses if
git cannot tell. Her name prints as "(name)". The key is read from
`~/priv/litery/sync/key.txt` (or `$LITERY_KEY_FILE`) and never printed. A reply
with no rows (a wrong or changed key gets an empty record) keeps the copy
saved before. The same guard sits in `pisz/tools/her-log.py`; each repo's
tests run it, so change both.
