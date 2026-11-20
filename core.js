// BananaOS Guide Maker's core: the same guide as guide-fetch (system/rootfs/usr/libexec/banana/guide-fetch) makes on
// the handheld, made in the browser instead: StrategyWiki's walkthrough for a game, else its franchise's wiki (only
// under a free licence), as guide.md + meta.json for <card>/banana/guides/<system>/<game>/. The wikis answer a page's
// requests directly (MediaWiki's origin=*), so nothing runs on a server. Plain functions, no DOM: tested with Node
// (web/guide-maker/test-core.mjs).

export const STRATEGYWIKI = "https://strategywiki.org/w/api.php";
const SW_WIKI = "https://strategywiki.org/wiki/";
const SW_LICENCE = "CC BY-SA 4.0 (edits before 2024-10-01: CC BY-SA 3.0)";
const SW_LICENCE_URL = "https://strategywiki.org/wiki/StrategyWiki:License";

// franchise wikis, the second source: (words any of which name the franchise, the wiki's API); guide-fetch's WIKIS
export const WIKIS = [
  [["mario", "luigi", "yoshi", "wario", "peach", "bowser"], "https://www.mariowiki.com/api.php"],
  [["zelda"], "https://zeldawiki.wiki/w/api.php"],
  [["metroid"], "https://www.metroidwiki.org/w/api.php"],
  [["kirby"], "https://wikirby.com/w/api.php"],
  [["sonic"], "https://sonic.fandom.com/api.php"],
  [["castlevania"], "https://castlevania.fandom.com/api.php"],
  [["megaman", "mega", "rockman"], "https://megaman.fandom.com/api.php"],
  [["final", "fantasy"], "https://finalfantasy.fandom.com/api.php"],
];

// the folder name a guide goes in, as the game panel looks for it (gameguide.cpp's slug): "Super Mario Bros. 2
// (USA).nes" -> "super-mario-bros-2"
export function slug(name) {
  let b = name.split("/").pop();
  const m = b.match(/^(.*)\.([A-Za-z0-9]{1,4})$/);
  if (m) b = m[1];
  b = b.replace(/[\(\[][^\)\]]*[\)\]]/g, " ").replace(/'/g, "");
  return b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join("-");
}

// a name's words for comparing (guide-fetch's words): tags and extension dropped, No-Intro's ", The" to the front
export function words(name) {
  let n = name.split("/").pop();
  const m = n.match(/^(.*)\.([A-Za-z0-9]{1,4})$/);
  if (m) n = m[1];
  n = n.replace(/[\(\[][^\)\]]*[\)\]]/g, " ").trim();
  n = n.replace(/^(.*?), (The|A|An)\b/, "$2 $1").replace(/'/g, "");
  return n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// how alike two names are (shared words over all words), 0 when their numbers differ (sequels)
export function score(a, b) {
  const sa = new Set(words(a)), sb = new Set(words(b));
  const nums = (s) => [...s].filter((w) => /^\d+$/.test(w)).sort().join(" ");
  if (nums(sa) !== nums(sb) || !sa.size || !sb.size) return 0;
  let both = 0;
  for (const w of sa) if (sb.has(w)) both++;
  return both / new Set([...sa, ...sb]).size;
}

// a MediaWiki API call from the browser (origin=*: the wikis allow it), one at a time, a quarter second apart per wiki
const last = new Map();
export async function api(base, params, fetchFn = fetch) {
  const wait = 250 - (Date.now() - (last.get(base) || 0));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last.set(base, Date.now());
  const q = new URLSearchParams({ ...params, format: "json", origin: "*" });
  const r = await fetchFn(base + "?" + q.toString());
  if (!r.ok) throw new Error(base.split("/")[2] + " answered " + r.status);
  return r.json();
}

// the guide's title on a wiki for a game's or ROM's name: game pages only, redirects followed, the closest by words
export async function search(base, name, call = api, atLeast = 0.6) {
  const q = words(name).join(" ");
  let best = null, bestScore = 0;
  for (const what of ["title", "text"]) {
    const d = await call(base, { action: "query", list: "search", srsearch: q, srnamespace: "0", srlimit: "20", srwhat: what });
    const cands = ((d.query || {}).search || []).map((r) => r.title).filter((t) => !t.includes("/"));
    if (!cands.length) continue;
    const r = await call(base, { action: "query", titles: cands.slice(0, 20).join("|"), redirects: "1" });
    const to = Object.fromEntries(((r.query || {}).redirects || []).map((x) => [x.from, x.to]));
    for (const c of cands) {
      const t = to[c] || c;
      if (t.includes("/")) continue;
      const sc = Math.max(score(name, c), score(name, t));
      if (sc > bestScore) { best = t; bestScore = sc; }
    }
    if (bestScore >= 0.999) break;
  }
  return bestScore >= atLeast ? best : null;
}

const hrefs = (html) => [...html.matchAll(/href="\/(?:wiki\/)?([^"#?]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/_/g, " "));

// StrategyWiki: the game's page, its Table of Contents' pages in that order, then its other subpages
export async function strategyWikiPages(game, call = api) {
  const all = [];
  let cont = {};
  for (;;) {
    const d = await call(STRATEGYWIKI, { action: "query", list: "allpages", apprefix: game, aplimit: "max", ...cont });
    all.push(...d.query.allpages.map((p) => p.title));
    if (!d.continue) break;
    cont = { apcontinue: d.continue.apcontinue };
  }
  const prefix = game + "/", sub = all.filter((t) => t.startsWith(prefix)), toc = prefix + "Table of Contents";
  const order = [];
  if (sub.includes(toc)) {
    const d = await call(STRATEGYWIKI, { action: "parse", page: toc, prop: "text" });
    for (const t of hrefs(d.parse.text["*"])) if (sub.includes(t) && !order.includes(t) && t !== toc) order.push(t);
  }
  const rest = sub.filter((t) => !order.includes(t) && t !== toc).sort();
  return (all.includes(game) ? [game] : []).concat(order, rest);
}

// a franchise wiki: the game's article, then the pages it links to titled "<x> (<game>)", in level order
export async function wikiPages(base, game, call = api) {
  const d = await call(base, { action: "parse", page: game, prop: "text", redirects: "1" });
  if (!d.parse) return [];
  const suffix = " (" + game + ")", order = [];
  for (const t of hrefs(d.parse.text["*"])) if (t.endsWith(suffix) && !order.includes(t)) order.push(t);
  const key = (t) => t.split(/(\d+)/).map((x) => (/^\d+$/.test(x) ? x.padStart(8, "0") : x.toLowerCase())).join("");
  order.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return [game, ...order];
}

// the wiki's licence when it is free (CC BY-SA or CC BY, never NonCommercial), else null
export async function freeLicence(base, call = api) {
  const d = await call(base, { action: "query", meta: "siteinfo", siprop: "rightsinfo" });
  const r = (d.query || {}).rightsinfo || {};
  const text = ((r.text || "") + " " + (r.url || "")).toLowerCase();
  const wordsIn = text.split(/[^a-z]+/);
  const free = /by-sa|attribution-sharealike|attribution share alike/.test(text) || /\bcc[- ]by\b(?!-n)/.test(text);
  return free && !wordsIn.includes("nc") && !text.includes("noncommercial") ? { text: r.text || "CC BY-SA", url: r.url || "" } : null;
}

// a page's HTML as the guide's text (guide-fetch's Text): "## " headings, "- " list items, table cells joined by
// " | ", a blank line between paragraphs; navigation boxes, edit links, references and images left out. A small tag
// walker, no DOM (the same in a page and in Node).
const SKIP = new Set(["script", "style", "sup", "figure", "noscript"]);
const VOID = new Set(["br", "img", "hr", "meta", "link", "input", "wbr", "source", "area", "col", "embed", "param", "track"]);
const SKIP_CLASS = /\b(mw-editsection|toc|navbox|noprint|reference|thumb|mw-empty-elt|metadata|hatnote)\b/;
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×" };
function unescape(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);
}
// a button or key picture's words, as guide-fetch's Text.icon_name: "Y button" -> "Y", "Neutral dpad" -> "D-pad"
export function iconName(alt) {
  return alt.trim().replace(/\.(png|svg|gif|jpe?g)$/i, "").replace(/\b(button|key|icon)\b/gi, "").replace(/\bneutral\b/gi, "")
    .replace(/\bd-?pad\b/gi, "D-pad").replace(/\b([lr])-?stick\b/gi, (m, c) => c.toUpperCase() + "-stick").replace(/\s+/g, " ").trim();
}
// a controls table's platform columns ("DS | Switch | PS5 | Xbox | Windows | Action"), as guide-fetch's
const PLATFORMS = /^(nes|snes|n64|gb|gbc|gba|ds|3ds|wii|wii u|gamecube|gcn|switch|ps[1-5]?|playstation( [1-5])?|psp|vita|xbox( 360| one| series x\|s)?|pc|windows|mac|linux|keyboard|mouse|arcade|genesis|mega drive|saturn|dreamcast|master system|game gear|steam deck|controller|gamepad|ios|android)$/i;
function tableRows(rows) {
  if (!rows.length) return [];
  const head = rows[0];
  const plat = head.map((c, i) => (PLATFORMS.test(c.trim()) ? i : -1)).filter((i) => i >= 0);
  if (plat.length >= 2 && head.length >= 3 && plat[0] !== head.length - 1) {
    const keep = [plat[0], head.length - 1];
    rows = rows.map((r) => (r.length === head.length ? keep.map((i) => r[i] ?? "") : r));
  }
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => r.join(" | "));
}
// symbols the handhelds' pixel font has no glyph for, as guide-fetch's Text.SYMBOLS
const SYMBOLS = { "←": "Left", "↑": "Up", "→": "Right", "↓": "Down", "↖": "Up-Left", "↗": "Up-Right", "↘": "Down-Right",
  "↙": "Down-Left", "⇐": "<=", "⇒": "=>", "⬆": "Up", "⬇": "Down", "⬅": "Left", "➡": "Right", "▲": "Up", "▼": "Down",
  "◀": "Left", "▶": "Right", "★": "*", "☆": "*", "♥": "heart", "♡": "heart", "♪": "", "●": "-", "○": "o", "■": "-",
  "□": "-", "✓": "yes", "✔": "yes", "✗": "no", "✘": "no" };
// MediaWiki's page HTML as plain text, as guide-fetch's Text: headings '## ', list items '- ', table rows as cells
// joined by ' | ' (a controls table: its first platform column and the action), button pictures as their names, a
// list or a paragraph inside a cell kept on its row ("; " between)
export function htmlToText(html) {
  const out = [];
  let line = [], skip = 0, cells = null, inCell = false;
  const stack = [], tables = [];
  const flush = (prefix = "") => {
    const t = line.join("").replace(/\s+/g, " ").trim();
    line = [];
    if (t) out.push(prefix + t);
  };
  const cellBreak = () => {
    const t = line.join("").trimEnd();
    if (t.trim() && !t.endsWith(";")) line = [t, "; "];
  };
  const attr = (a, n) => (a.match(new RegExp("\\b" + n + "=\"([^\"]*)\"")) || [])[1] || "";
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) { if (!skip) line.push(unescape(m[5])); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase(), closing = m[1] === "/", attrs = m[3] || "";
    if (VOID.has(tag)) {
      if (skip || closing) continue;
      if (tag === "br") { if (inCell) cellBreak(); else flush(); }
      else if (tag === "img") {         // a small picture (a button): its name
        const w = parseInt(attr(attrs, "width"), 10) || 0, name = iconName(unescape(attr(attrs, "alt")));
        if (name && w > 0 && w <= 64) line.push(" " + name + " ");
      }
      continue;
    }
    if (!closing) {
      const cls = attr(attrs, "class"), id = attr(attrs, "id");
      const hide = SKIP.has(tag) || SKIP_CLASS.test(cls) || id === "toc";
      if (m[4] === "/") continue;   // (<tag/>)
      stack.push(hide);
      if (hide) { skip++; continue; }
      if (skip) continue;
      if (inCell && ["p", "div", "li", "dl", "dd", "dt", "ul", "ol"].includes(tag)) cellBreak();
      else if (["p", "div", "dl", "dd", "dt"].includes(tag)) { flush(); if (tag === "p") out.push(""); }
      else if (/^h[2-6]$/.test(tag)) { flush(); out.push(""); }
      else if (tag === "li") flush();
      else if (tag === "table") { flush(); tables.push([]); }
      else if (tag === "tr") { flush(); cells = []; }
      else if (tag === "td" || tag === "th") { line = []; inCell = true; }
      continue;
    }
    const hide = stack.length ? stack.pop() : false;
    if (hide) { skip--; continue; }
    if (skip) continue;
    if (inCell && ["li", "p", "div", "ul", "ol", "dl", "dd", "dt"].includes(tag)) cellBreak();
    else if (/^h[2-6]$/.test(tag)) { flush("#".repeat(Math.min(+tag[1], 4)) + " "); out.push(""); }
    else if (tag === "li") flush("- ");
    else if (tag === "td" || tag === "th") {
      const t = line.join("").replace(/\s+/g, " ").trim().replace(/;$/, "").trim();
      line = []; inCell = false;
      if (cells) cells.push(t.replaceAll(" | ", " / "));
    }
    else if (tag === "tr") {
      if (cells && cells.some(Boolean)) { if (tables.length) tables[tables.length - 1].push(cells); else out.push(cells.join(" | ")); }
      cells = null;
    }
    else if (tag === "table" && tables.length) { flush(); out.push(...tableRows(tables.pop())); out.push(""); }
    else if (["p", "div", "table", "ul", "ol", "dl"].includes(tag)) { flush(); if (["p", "table", "ul", "ol"].includes(tag)) out.push(""); }
  }
  flush();
  const s = [...out.join("\n")].map((c) => SYMBOLS[c] ?? c).join("");
  return s.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// a game's guide: StrategyWiki first, else its franchise's wiki when free; null when neither has one.
// progress(text) is told each step. -> { title, folder (slug), md, meta }
export async function makeGuide(name, system, { raGame = 0, progress = () => {}, call = api } = {}) {
  let base = STRATEGYWIKI, src = { name: "StrategyWiki", url: SW_WIKI, licence: SW_LICENCE, licenceUrl: SW_LICENCE_URL }, pages;
  progress("Looking for " + name + " on StrategyWiki");
  let title = await search(base, name, call);
  if (title) pages = await strategyWikiPages(title, call);
  if (!title || !pages.length) {
    title = null;
    const ws = new Set(words(name));
    for (const [keys, wiki] of WIKIS) {
      if (!keys.some((k) => ws.has(k))) continue;
      progress("Looking on " + wiki.split("/")[2]);
      const lic = await freeLicence(wiki, call);
      if (!lic) continue;
      title = await search(wiki, name, call);
      if (!title) continue;
      const site = wiki.split("/")[2];
      base = wiki;
      src = { name: site, url: "https://" + site + "/wiki/", licence: lic.text, licenceUrl: lic.url };
      pages = await wikiPages(wiki, title, call);
      break;
    }
  }
  if (!title || !pages || !pages.length) return null;
  const body = [], sections = [];
  for (let i = 0; i < pages.length; i++) {
    const t = pages[i];
    progress("Page " + (i + 1) + " of " + pages.length + ": " + t);
    const d = await call(base, { action: "parse", page: t, prop: "text|revid", disableeditsection: "1", disabletoc: "1", redirects: "1" });
    if (!d.parse) continue;
    const sec = t === title ? "Overview" : t.startsWith(title + "/") ? t.slice(title.length + 1) : t.endsWith(" (" + title + ")") ? t.slice(0, -(title.length + 3)) : t;
    body.push("# " + sec + "\n\n" + htmlToText(d.parse.text["*"]));
    sections.push({ name: sec, page: t, url: src.url + encodeURIComponent(t.replace(/ /g, "_")), revid: d.parse.revid || 0 });
  }
  const meta = {
    schema: 1, title, system, ra_game: raGame, source: src.name, source_url: src.url + encodeURIComponent(title.replace(/ /g, "_")),
    licence: src.licence, licence_url: src.licenceUrl,
    credit: "From " + (src.name === "StrategyWiki" ? "StrategyWiki, the video game walkthrough and strategy guide wiki" : src.name) +
      ", by its contributors (see each page's history). Text only, unchanged except for formatting. Made with the BananaOS Guide Maker.",
    fetched: new Date().toISOString().slice(0, 10), sections,
  };
  return { title, folder: slug(name), md: body.join("\n"), meta };
}
