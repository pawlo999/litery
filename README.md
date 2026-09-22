# Litery

A small letters-and-numbers game for a pre-schooler, in Polish and Norwegian.

Shows a picture, a word with a letter missing, and two answers. Tap the picture
to hear the word; tap a letter to hear it inside another word. Counting
questions work the same way — a group of objects, an empty tile, two digits.
Twenty right answers earns a prize into an album of sixteen.

**No asset files.** Pictures are emoji from the operating system, speech is the
device's own voice, and the chime is generated. The whole app is one HTML file.

It keeps a Leitner box per letter and per number and picks what to ask next by
weighting toward whatever is least known, so it drills what the child is
actually missing rather than choosing at random.

The child's name is typed in on the device and stored there. It is not in this
repository, and no progress data is either.

    node test/test.mjs     # 92 behaviour checks, runs the real app in jsdom

`PLAN.md` has the stage ladder and what is built so far.
