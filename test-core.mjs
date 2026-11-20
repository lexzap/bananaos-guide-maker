// node web/guide-maker/test-core.mjs [--live]: the Guide Maker's core against made-up wiki answers (no network), and
// with --live against the real StrategyWiki and Super Mario Wiki. The same rules as guide-fetch, so the same checks.
import { slug, words, score, search, wikiPages, freeLicence, htmlToText, makeGuide, includedGames, shortName } from "./core.js";

let fails = 0;
const check = (ok, what) => { console.log((ok ? "  ok    " : "  FAIL  ") + what); if (!ok) fails++; };

check(slug("Super Mario Bros. 2 (USA).nes") === "super-mario-bros-2", "slug: as the game panel's (gameguide.cpp)");
check(slug("Super Mario Bros. 2") === "super-mario-bros-2", "slug: a title's '. 2' kept");
check(JSON.stringify(words("Legend of Zelda, The - Link's Awakening DX (USA, Europe).gbc")) === JSON.stringify(["the", "legend", "of", "zelda", "links", "awakening", "dx"]), "words: ', The' to the front");
check(score("Super Mario Bros. 3", "Super Mario Bros. 2") === 0, "score: a sequel with another number is 0");

const t = htmlToText('<div class="nav_box noprint"><ul><li>NAV</li></ul></div><p>Before <img src="x" alt="A"> after.</p><br>' +
  '<h2><span>Map A</span><span class="mw-editsection">[edit]</span></h2><ul><li>first</li><li>second</li></ul>' +
  '<table><tr><th>Item</th><th>Where</th></tr><tr><td>Key</td><td>Jar</td></tr></table><p>Ref<sup class="reference">[1]</sup> &amp; end.</p>');
check(t.includes("after.") && !t.includes("NAV"), "text: kept after an <img>, navigation left out");
check(t.includes("## Map A") && !t.includes("[edit]"), "text: headings, no edit links");
check(t.includes("- first\n- second") && t.includes("Item | Where") && t.includes("Key | Jar"), "text: lists and tables");
check(t.includes("Ref & end.") && !t.includes("[1]"), "text: entities decoded, references left out");
// a controls table as StrategyWiki has them (the same as guide-fetch's test): buttons as small pictures, a list in a
// cell, platform columns
const c = htmlToText(`<table><tr><th>DS</th><th>Switch</th><th>PS5</th><th>Action</th></tr>
<tr><td><img alt="Neutral dpad" width="24" height="24"></td><td><img alt="Neutral Dpad" width="24"> or
<img alt="Neutral Lstick" width="24"></td><td>x</td><td><ul><li>Move</li><li>Select menu items</li></ul></td></tr>
<tr><td><img alt="Y button" width="24"></td><td><img alt="Y Button" width="24"></td><td><img alt="Square button" width="24"></td>
<td>Attack</td></tr>
<tr><td>&#8593; + <img alt="A button" width="24"></td><td>-</td><td>-</td><td>Bullet soul</td></tr></table>
<p>A picture: <img alt="A big map" width="400" height="300"> after it. Stars: &#9733; &#10003;</p>
<table><tr><th>Item</th><th>Price</th><th>Where</th></tr><tr><td>Potion</td><td>50</td><td>Shop</td></tr></table>`);
check(c.includes("DS | Action"), "controls table: the first platform column and the action");
check(c.includes("D-pad | Move; Select menu items"), "controls table: a button picture as its name, a list in a cell on its row");
check(c.includes("Y | Attack") && !c.includes("Square"), "controls table: the other platforms left out");
check(c.includes("Up + A | Bullet soul"), "symbols: an arrow the pixel font lacks as a word");
check(!c.includes("A big map") && c.includes("A picture: after it."), "a big picture still left out");
check(c.includes("Stars: * yes"), "symbols: others as ASCII or words");
check(c.includes("Potion | 50 | Shop"), "a table without platform columns keeps all its columns");

// a compilation (as guide-fetch's test): its list's guides with pages of their own; not its facts box's, text's or
// series box's links
const PACK = '<div class="nav_box header_nav noprint"><b>Test Pack</b></div>' +
  '<table><tr><td>Followed by</td><td><a href="/wiki/Next_Game" class="guide_link" title="Next Game">N</a></td></tr></table>' +
  '<p>Two: <a href="/wiki/Quest" class="guide_link" title="Quest">Q</a>.</p>' +
  '<ul><li><a href="/wiki/Quest" class="guide_link guide_link-cs5" title="Quest">Quest</a></li>' +
  '<li><a href="/wiki/Pageless" class="guide_link" title="Pageless">Pageless</a></li></ul>' +
  '<div class="series_box nav_box"><ul><li><a href="/wiki/Next_Game" class="guide_link" title="Next Game">N</a></li></ul></div>';
const packPages = { "Test Pack": PACK, "Quest": "<p>Quest.</p>", "Quest/Walkthrough": "<p>Go.</p>", "Next Game": "<p>No.</p>",
  "Next Game/Walkthrough": "<p>No.</p>", "Pageless": "<p>One page.</p>" };
const packCall = async (base, p) => p.list === "allpages" ? { query: { allpages: Object.keys(packPages).filter((t) => t.startsWith(p.apprefix)).map((title) => ({ title })) } }
  : p.list === "search" ? { query: { search: p.srwhat === "title" ? [{ title: "Test Pack" }] : [] } }
  : { parse: { title: p.page, revid: 1, text: { "*": packPages[p.page] ?? "" } } };
const inc = await includedGames("Test Pack", packCall);
check(inc.map(([g]) => g).join() === "Quest", "compilation: only its list's guides with pages: " + inc.map(([g]) => g).join());
check(shortName("The Legend of Zelda: Four Swords") === "Four Swords", "compilation: a game's name without its series");
const pack = await makeGuide("Test Pack", "gba", { call: packCall });
check(pack && pack.meta.sections.map((x) => x.name).join("|") === "Overview|Quest: Overview|Quest: Walkthrough",
  "compilation: its page, then its games' sections named after them: " + (pack && pack.meta.sections.map((x) => x.name).join("|")));

const fake = async (base, p) => {
  if (p.list === "search") return { query: { search: (p.srwhat === "title" ? ["Super Mario Bros. 2/Items", "Super Mario Bros 2", "Super Mario Bros. 3"] : []).map((title) => ({ title })) } };
  if (p.titles !== undefined) return { query: { redirects: [{ from: "Super Mario Bros 2", to: "Super Mario Bros. 2" }] } };
  if (p.meta === "siteinfo") return { query: { rightsinfo: { text: base.includes("nc") ? "Attribution-NonCommercial-ShareAlike" : "CC-BY-SA" } } };
  if (p.action === "parse") return { parse: { title: p.page, text: { "*": '<a href="/World_7-2_(G)">x</a><a href="/wiki/World_1-10_(G)">y</a><a href="/World_1-2_(G)">z</a>' } } };
  return {};
};
check(await search("x", "Super Mario Bros. 2 (USA).nes", fake) === "Super Mario Bros. 2", "search: redirect followed, subpage skipped");
check(await search("x", "Super Mario Bros. 4 (USA).nes", fake) === null, "search: no other sequel");
check(JSON.stringify(await wikiPages("x", "G", fake)) === JSON.stringify(["G", "World 1-2 (G)", "World 1-10 (G)", "World 7-2 (G)"]), "wiki pages: level order");
check((await freeLicence("https://free/api.php", fake)) !== null && (await freeLicence("https://nc/api.php", fake)) === null, "licence: CC-BY-SA yes, NonCommercial never");

if (process.argv.includes("--live")) {
  const g = await makeGuide("Super Mario Bros. 2 (USA).nes", "nes", { raGame: 1994, progress: () => {} });
  check(g && g.folder === "super-mario-bros-2" && g.meta.source === "StrategyWiki", "live: SMB2 from StrategyWiki into super-mario-bros-2");
  check(g && g.meta.sections.some((s) => s.name === "World 5-1") && g.md.includes("# World 5-1\n"), "live: its World 5-1 section");
  check(g && g.md.length > 100000, "live: the whole guide (" + (g ? Math.round(g.md.length / 1024) : 0) + " KB)");
}
console.log("test-core: " + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
