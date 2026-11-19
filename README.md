# BananaOS Guide Maker

Walkthrough guides for the **Guide** page on BananaOS's second screen (RG DS / RG DS Plus), made in your browser.

**Use it:** https://lexzap.github.io/bananaos-guide-maker/

1. List your games, one per line. File names work best (`Super Mario Bros. 2 (USA).nes`), because that's how the Guide matches a guide to a game. Pick their system.
2. **Make the guides.** Your browser fetches each guide from **StrategyWiki** (walkthroughs). If StrategyWiki has none, it tries the game's franchise wiki (Super Mario Wiki, Zelda Wiki and others), but only when that wiki's licence is free (CC BY-SA). Expect about a minute per game: each wiki gets one request a second.
3. **Download the guides zip** and copy its `banana` folder onto the card's big partition, merging folders. Then, while a game plays: **Guide**, next to All achievements. It opens at the level you're on.

Everything runs in the browser, and no server is involved. Each guide keeps its source and licence in `meta.json`. The text is CC BY-SA: credit the wiki and share it alike. GameFAQs isn't supported, because the site no longer serves pages to tools.

Unofficial and not part of BananaOS. The Guide page itself lives in a BananaOS branch that hasn't been released yet. The page's look and its zip writer come from BananaOS's Save Mover (MIT).

`node test-core.mjs` runs the tests offline; `node test-core.mjs --live` runs them against the real wikis.
