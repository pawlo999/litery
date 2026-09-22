# Litery — plan

## Where we are

A proof of concept. One stage, two answer buttons, words picked at random, and
until today nothing remembered between questions. Every change so far has been
a reaction to the last thing the child hit. This document is the thing that was
missing.

## The one thing the app does not have

**No model of what she knows.** It cannot tell a letter she owns from one she
guesses, so it cannot choose what to ask next, cannot decide when to make the
task harder, and cannot tell you whether she is learning. Everything below is
built on fixing that.

---

## 1 · The log  *(built, build 16)*

One row per finished question, on her device, ~70 bytes:

    t  when            l  language        k  L=letter N=number
    s  stage           x  target          d  distractor offered
    o  options shown   w  wrong taps      ms time to answer
    h  picture taps    c  letter taps

`h` and `c` are the important ones nobody would think to record: they say
whether she *needed* the audio. A letter answered with no help is known; the
same letter answered after three taps of the picture is not.

Capped at 2000 rows (~140 KB) and rolled into daily totals beyond that.
A parent test run writes nothing.

## 2 · What it remembers per item

Per language × kind × target:

    n     times seen
    ft    times right first try
    box   1..5  Leitner box — first-try correct promotes, any miss resets to 1
    ms[]  last ten response times

**Knows it = box ≥ 4 and median time under 4 s.** Time matters: a correct
answer after nine seconds of staring is not the same skill as one in 1.5 s.
Median, not mean, and times over 15 s are discarded — at four years old a long
answer usually means someone spoke to her, not that she was thinking.

## 3 · What the app does with it

**Choosing the next question.** *(built, b25; revised b32)* A weighted draw from
the current stage, weight `6 − box + days since last seen (capped at 4)`, so a
letter in box 1 comes up five times as often as one in box 5, and a mastered
letter steps aside for the rest of the day then climbs back as it goes stale.

The first version used a flat "one question in five is drawn from mastered
items". With three letters that was fine; as soon as the pool grew, the whole
20 % landed on the single mastered letter and put it back on top of the
distribution. Staleness does the same job without the cliff.

**How many letters are in play** *(b32)* is capped separately: she sees the
letters she has already met plus `newAtOnce` (2) she has not. Thirteen letters
arriving at once would drop her from 67 % to near guessing in one session.

The deeper fix was ordering: the letter is chosen **first**, and the word is
picked to carry it. Previously a word was drawn at random and the letter fell
out of it — and with five Polish S-words against three B-words, S was
structurally favoured. Her first 59 attempts showed S twelve times against T
six and B five, which is why she mastered S and stalled on the other two.

**Moving up a stage.** A stage clears when **≥80 % of its targets reach box 4,
seen on at least two different days**, and never mid-round. The two-day rule is
the point: one good session is mood, overnight retention is learning.
*Chosen 2026-09-20 over same-session advancement: the failure mode that matters
is her refusing to open the app, not progressing a day late.*

**Moving back down.** If first-try accuracy over the last 20 falls below 55 %,
drop a stage. Better to be bored for a day than to quit.

Both overridable from the parent panel.

---

## 4 · The ladders

### Letters — per language

| | What changes | Why it is the next step |
|---|---|---|
| L1 | first letter, 2 options | where she is now |
| L2 | 3 options | 50 % guessing becomes 33 % |
| L3 | confusable distractors (b/d/p, m/n, o/ó) | shape discrimination |
| L4 | **last** letter missing | position independence |
| L5 | **middle vowel** missing | real decoding begins here |
| L6 | any position | full letter–sound mapping |
| L7 | two letters missing | holding a word together |
| L8 | pick the whole word from three | word recognition |
| L9 | tap the syllables in order | blending — Polish first, it is regular |
| L10 | build the word from a letter bank | spelling |

**Case is a separate axis, not a stage:** `UPPER → Aa paired → lower`, advancing
when ≥80 % of letters are box ≥4 at the current case. She can be at L5 in
uppercase and L2 in lowercase; they are different skills.

### Numbers

| | What changes |
|---|---|
| N1 | count 1–5, 2 options |
| N2 | count 1–10 |
| N3 | 3 options, ±1 distractors — the hard part of counting |
| N4 | digit shown, pick the matching group (reverse direction) |
| N5 | what comes next in the sequence |
| N6 | add within 5, with objects on screen |

### The constraint nobody escapes

**L4 onward needs a much bigger word list.** Eleven Polish words cannot supply
"last letter missing" or "middle vowel missing" with any variety, and every word
needs an emoji a four-year-old recognises. Growing each language to 60–80 words
is the single largest piece of work in this plan, and it is content, not code.

---

## 5 · What the parent sees

- **Per-letter grid** — every letter, coloured by box, with attempts and
  first-try %. Answers "does she know B yet".
- **14-day history** — questions, first-try %, prizes per day.
- **Current stage** per language per kind, with progress toward clearing it.
- **Test run** — play without touching her stats, prizes or progress. *(built)*
- **Copy data** — the whole log to the clipboard, so it is never trapped on the
  device and can be handed to someone who can read it.

---

## 6 · Build order

| | Slice | State |
|---|---|---|
| S1 | attempt log, mastery boxes, parent test run | **done, b16** |
| S2 | parent dashboard — make the data visible | **done, b17** |
| S3 | weighted selection — the app starts adapting | **done, b25** |
| S4 | auto-advancement + L2, L3 | next |
| S5 | content: 60–80 words per language | **done, b32** — 13 PL letters / 39 words, 12 NO / 32 |
| S6 | L4–L6 position variants | |
| S7 | case axis | |
| S8 | N2–N4 | |
| S9 | syllables, spelling | |
| S10 | HTTPS + service worker — genuinely offline | |

S2 and S3 should not wait. A log nothing reads is dead weight; the value only
arrives when selection and advancement consume it.

## 7 · Where this could go wrong

- **Advancement outrunning her.** Hence two days, never mid-round, and a
  demotion rule. The failure mode is not slow progress, it is her refusing to
  open the app.
- **Measuring instead of watching.** The dashboard is for deciding what to
  build next, not for scoring a four-year-old. The only metric that matters is
  whether she asks for it tomorrow.
- **Content quality gating everything.** A bad emoji choice teaches the wrong
  word. Every addition needs a real check that she recognises the picture.
