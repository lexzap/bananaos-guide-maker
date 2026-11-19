// node web/guide-maker/test-core.mjs [--live]: the Guide Maker's core against made-up wiki answers (no network), and
// with --live against the real StrategyWiki and Super Mario Wiki. The same rules as guide-fetch, so the same checks.
import { slug, words, score, search, wikiPages, freeLicence, htmlToText, makeGuide } from "./core.js";

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
