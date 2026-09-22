# Behaviour tests

Runs the real `index.html` in jsdom with iOS speech replaced by a recorder, so
every assertion is about what the app actually *does* and *says* — not how it
looks. Screenshots cover the looks; this covers the behaviour.

    cd test && node test.mjs

Checks: the welcome greeting, that each new picture speaks itself, that a wrong
tap says "<letter> jak <word>" rather than the bare word, that counting
questions render a countable group and offer the right digit, that a full round
reaches the prize, that the board opens and the back arrow returns, and that
the language can be switched after a round.
