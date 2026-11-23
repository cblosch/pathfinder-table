// Freeform map descriptions.
//
// parseScene(text) reads a description sentence by sentence and returns the
// things it mentions (with counts, adjectives and directions) and how they
// relate to each other ("an altar behind the throne", "statues flanking the
// door", "a well north of the inn"). placeScene(map, scene) then puts each
// thing on the map: things others refer to first, each on the nearest open
// square that satisfies its relations. Nothing here needs a network or an AI.

// ---------------------------------------------------------------
// vocabulary: concepts and the words for them
// ---------------------------------------------------------------
// kind: obj (a placed object), struct (a small building), area (handled by the
// map's feature passes; usable as a reference), room (a reference to a room)
export const CONCEPTS = {
  altar: { kind: "obj", words: ["altar", "sacrificial altar", "offering table", "shrine stone"], glyph: "t", w: 2 },
  throne: { kind: "obj", words: ["throne", "seat of power", "dais", "high seat"], glyph: "t" },
  statue: { kind: "obj", words: ["statue", "idol", "effigy", "sculpture", "monument", "obelisk", "totem", "gargoyle", "bust"], glyph: "p" },
  pillar: { kind: "obj", words: ["pillar", "column", "pilaster"], glyph: "p", find: "p" },
  fountain: { kind: "obj", words: ["fountain", "basin", "font"], pattern: "fountain" },
  well: { kind: "obj", words: ["well", "wellspring", "cistern"], pattern: "well" },
  sarcophagus: { kind: "obj", words: ["sarcophagus", "coffin", "casket", "bier", "grave", "tombstone", "headstone", "crypt niche"], glyph: "t", h: 2 },
  chest: { kind: "obj", words: ["chest", "coffer", "strongbox", "treasure", "hoard", "lockbox"], glyph: "t" },
  cage: { kind: "obj", words: ["cage", "pen", "kennel", "stocks", "pillory", "gibbet"], glyph: "t" },
  table: { kind: "obj", words: ["table", "desk", "workbench", "bench", "counter", "bar", "lectern", "podium", "pulpit", "anvil", "forge"], glyph: "t", w: 2 },
  bed: { kind: "obj", words: ["bed", "cot", "bunk", "bedroll", "pallet", "hammock"], glyph: "t" },
  shelf: { kind: "obj", words: ["bookshelf", "bookcase", "shelf", "shelves", "rack", "wardrobe", "cabinet"], glyph: "t" },
  crate: { kind: "obj", words: ["crate", "barrel", "cask", "sack", "box", "supplies", "keg", "urn", "jar", "pot"], glyph: "t" },
  fire: { kind: "obj", words: ["campfire", "fire pit", "firepit", "bonfire", "hearth", "fireplace", "brazier", "pyre", "cooking fire", "fire"], glyph: "t", light: 4 },
  light: { kind: "obj", words: ["candle", "torch", "sconce", "lantern", "lamp", "chandelier", "glowing crystal"], light: 3, glyph: null },
  tent: { kind: "struct", words: ["tent", "pavilion", "yurt", "lean-to"], w: 3, h: 3, floor: "b" },
  tree: { kind: "obj", words: ["tree", "oak", "willow", "palm", "palm tree", "pine", "yew", "birch", "ash tree", "elm", "great tree"], glyph: "T", find: "T" },
  boulder: { kind: "obj", find: "r", words: ["boulder", "rock", "standing stone", "menhir", "monolith", "stone circle", "cairn", "stalagmite"], glyph: "r" },
  bones: { kind: "obj", words: ["bones", "bone", "skeleton", "corpse", "body", "bodies", "remains", "skull", "skulls", "carcass"], glyph: "^" },
  web: { kind: "obj", words: ["web", "cobweb", "webs", "spiderweb"], glyph: "f" },
  fungus: { kind: "obj", words: ["mushroom", "fungus", "fungi", "toadstool", "mold", "moss"], glyph: "f" },
  crystal: { kind: "obj", words: ["crystal", "gem", "geode", "shard"], glyph: "p", light: 2 },
  pit: { kind: "obj", words: ["pit", "trapdoor", "hole", "shaft", "trap"], glyph: "v" },
  circle: { kind: "obj", words: ["summoning circle", "ritual circle", "magic circle", "circle", "runes", "sigil", "pentagram", "glyph", "portal"], pattern: "circle" },
  wagon: { kind: "obj", words: ["wagon", "cart", "carriage", "caravan", "coach"], glyph: "t", w: 2 },
  boat: { kind: "obj", words: ["boat", "rowboat", "ship", "raft", "canoe", "skiff", "barge"], glyph: "b", w: 3, water: true },
  stall: { kind: "obj", words: ["stall", "market stall", "booth", "vendor stand"], glyph: "t", w: 2 },
  lever: { kind: "obj", words: ["lever", "winch", "switch", "chain"], glyph: "t" },
  stairs: { kind: "obj", words: ["stairs", "stair", "staircase", "steps", "ladder", "stairway"], glyph: "S" },
  hut: { kind: "struct", words: ["hut", "shack", "house", "cottage", "cabin", "hovel", "shed", "barn", "lodge", "farmhouse", "outhouse", "smithy", "chapel", "shrine"], w: 5, h: 4, floor: "b" },
  tower: { kind: "struct", words: ["tower", "watchtower", "spire", "turret", "lighthouse"], w: 4, h: 4, floor: ".", stairs: true },
  // areas: placed by the map's own passes, usable as references
  lake: { kind: "area", words: ["lake", "pool", "pond", "lagoon", "spring", "oasis", "reservoir", "water"], find: "water" },
  river: { kind: "area", words: ["river", "stream", "creek", "brook", "channel", "canal"], find: "water" },
  chasm: { kind: "area", words: ["chasm", "rift", "crevasse", "abyss", "gorge", "ravine"], find: "v" },
  lava: { kind: "area", words: ["lava", "magma"], terrain: "L" },
  ice: { kind: "area", words: ["ice", "frozen pool", "frost"], terrain: "I" },
  bridge: { kind: "obj", words: ["bridge", "footbridge", "walkway", "catwalk"], findLabel: "Bridge", pattern: "bridge" },
  entrance: { kind: "area", words: ["entrance", "entry", "entryway", "gate", "gates", "doorway", "door", "front door", "mouth", "way in", "archway"], findLabel: ["Entrance", "Cave mouth", "Gate", "Way in"] },
  ziggurat: { kind: "area", words: ["ziggurat", "pyramid"], findLabel: "Ziggurat" },
  road: { kind: "area", words: ["road", "street", "path", "trail", "track"], find: "=" },
  room: { kind: "room", words: ["room", "chamber", "hall", "vault", "cell", "alcove", "nave", "antechamber", "sanctum", "throne room", "great hall"] },
};

// relation phrases (between "A ... B"); `rev` means the phrase reads "A is <done> by B"
const RELATIONS = [
  ["on", /\b(on top of|atop|on|upon|resting on|perched on|stands on|sits on)\b/],
  ["in", /\b(inside|within|in the middle of|in|at the center of)\b/],
  ["behind", /\b(behind|at the back of|beyond|past)\b/],
  ["front", /\b(in front of|before|facing|faces|at the foot of)\b/],
  ["beside", /\b(beside|next to|near|nearby|by|alongside|close to|adjacent to|against|at the side of|overlooking|overlooks|guarding|guards|guard)\b/],
  ["cross", /\b(crosses|crossing|spans|spanning|bridges|bridging|over)\b/],
  ["across", /\b(across from|opposite|across)\b/],
  ["between", /\b(between|among|amid)\b/],
  ["around", /\b(around|surrounding|surround|surrounds|encircling|encircle|encircles|ringing|circling)\b/],
  ["flank", /\b(flanking|flank|flanks|on either side of|on both sides of|either side of)\b/],
  ["line", /\b(lining|line|lines|along|down)\b/],
  ["end", /\b(at the (far )?end of|at the head of|at the top of)\b/],
  ["n", /\b(north of|to the north of|above)\b/], ["s", /\b(south of|to the south of|below)\b/],
  ["e", /\b(east of|to the east of|right of)\b/], ["w", /\b(west of|to the west of|left of)\b/],
];
const PASSIVE = [
  ["around", /\b(surrounded by|ringed by|encircled by|circled by)\b/],
  ["flank", /\b(flanked by)\b/],
  ["line", /\b(lined with|lined by)\b/],
  ["beside", /\b(guarded by|watched over by)\b/],
  ["in", /\b(holds|contains|houses)\b/],
];
const DIRS = [
  ["ne", /\b(north[- ]?east(ern)?)\b/], ["nw", /\b(north[- ]?west(ern)?)\b/], ["se", /\b(south[- ]?east(ern)?)\b/], ["sw", /\b(south[- ]?west(ern)?)\b/],
  ["n", /\b(north(ern)?( end| side| wall| edge)?)\b/], ["s", /\b(south(ern)?( end| side| wall| edge)?)\b/], ["e", /\b(east(ern)?( end| side| wall| edge)?)\b/], ["w", /\b(west(ern)?( end| side| wall| edge)?)\b/],
  ["c", /\b(the (middle|center|centre|heart)( of)?)\b/],
  ["far", /\b(far (end|side|edge|corner|wall)|other (end|side)|back (wall|of the room))\b/],
];
const NUMS = { a: 1, an: 1, one: 1, single: 1, lone: 1, two: 2, pair: 2, both: 2, twin: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, several: 4, some: 3, many: 6, few: 3, dozen: 12, rows: 6, row: 5 };
const ADJ = /\b(large|huge|great|massive|giant|small|tiny|little|old|ancient|ruined|broken|crumbling|collapsed|stone|wooden|iron|bronze|golden|silver|bone|obsidian|marble|black|white|red|blood[- ]?stained|burning|glowing|rotting|overturned|carved|sacrificial|tall|short|wide|narrow|crude|ornate|sunken|raised|cracked|mossy|ivy[- ]covered)\b/g;

// word lookup: plurals, multiword phrases and one-letter typos
const PHRASES = [];
for (const [id, cpt] of Object.entries(CONCEPTS)) for (const w of cpt.words) PHRASES.push([w, id]);
PHRASES.sort((a, b) => b[0].length - a[0].length);
const singular = (w) => (/(us|is|ss|ous)$/.test(w) ? w : w.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/([^s])s$/, "$1"));
function near1(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
const SINGLE_WORDS = PHRASES.filter(([w]) => !w.includes(" "));

const STOP = new Set(["the", "a", "an", "of", "and", "or", "with", "its", "their", "his", "her", "this", "that", "these", "those", "is", "are", "was", "were", "be", "it", "them", "there", "here", "some", "which", "who", "where", "while", "map", "place", "area", "end", "side", "edge", "middle", "center", "centre", "north", "south", "east", "west", "way", "front", "back", "top", "bottom", "left", "right", "pair", "row", "rows", "number", "lot", "kind", "sort", "bit", "part", "one", "corner", "wall", "walls", "floor", "ceiling", "level", "town", "village", "city", "cave", "cavern", "forest", "woods", "desert", "swamp", "dungeon", "inn", "tavern", "people", "cultists", "bandits", "guards", "monsters", "goblins", "creatures", "it", "air", "light", "darkness", "shadow", "shadows", "strip", "structure", "houses", "buildings", "temple", "crypt", "tomb", "lair", "den", "hideout", "camp", "clearing", "ruins", "castle", "keep", "fortress", "sewer", "sewers", "mine", "tunnel", "tunnels", "grove", "glade", "jungle", "marsh", "bog", "valley", "hill", "hills", "mountain", "beach", "coast", "shore", "island", "plains", "field", "meadow", "room", "largest", "biggest", "smallest", "main", "first", "second", "third", "last", "final", "far", "inner", "outer", "central", "great", "other", "same", "whole", "entire", "own", "rest", "edge", "surface", "ground", "dirt", "sand", "grass", "mud", "water", "stone", "wood", "bone", "iron", "gold", "silver", "dragon", "merchant", "cult", "goblin", "bandit", "underground", "surface", "town center", "outskirts", "distance", "darkness", "gloom", "cultist", "populated", "inhabitant", "inhabitants", "everything", "nothing", "something", "space"]);
// words that are verbs or modifiers, never things
const ADJ_OK = /^(bloodstained|blood-stained|cracked|carved|ruined|abandoned|collapsed|sunken|raised|overturned|burned|cursed|gilded|tarnished|chained|hooded|robed|armored)$/;
const NOT_NOUN = /^(stands?|sits?|rests?|lies|lie|burns?|hangs?|crosses|leads?|runs?|is|are|has|have|holds?|looms?|rises?|towers?|waits?|stretches|litters?|covers?|fills?|dots?|surrounds?|guards?|flanks?|lines?|faces?|watches|blocks?|bars?|sees?|opens?)$/;

// ---------------------------------------------------------------
// parsing
// ---------------------------------------------------------------
export function parseScene(text) {
  const src = ` ${String(text || "").toLowerCase().replace(/[“”"]/g, " ").replace(/\s+/g, " ")} `;
  const entities = [];
  const relations = [];
  let lastHead = null; // for "it"
  const sentences = src.split(/(?<=[.;!?])\s+|\n/);
  for (const sentence of sentences) {
    // clauses: commas and ", and" keep relations local; "with" stays inside its clause
    for (const clause of sentence.split(/[.;!?]|,\s*(?:and |while |where |but |which )?/)) {
      const c = ` ${clause.trim()} `;
      if (c.trim().length < 2) continue;
      const mentions = findMentions(c, entities, lastHead);
      if (!mentions.length) continue;
      // directions in the clause belong to the mention nearest them (unless they're part of a relation)
      for (const [d, re] of DIRS) {
        const m = re.exec(c);
        if (!m) continue;
        const before = c.slice(Math.max(0, m.index - 12), m.index);
        if (/\b(of|to the)\s*$/.test(c.slice(m.index + m[0].length, m.index + m[0].length + 6)) || /\b(north|south|east|west)$/.test(before.trim())) continue;
        const target = mentions.reduce((a, b) => (Math.abs(a.at - m.index) <= Math.abs(b.at - m.index) ? a : b));
        if (!target.ent.where) target.ent.where = d;
      }
      // relations between consecutive mentions
      for (let i = 1; i < mentions.length; i++) {
        const A = mentions[i - 1], B = mentions[i];
        const between = c.slice(A.end, B.at);
        const rel = relIn(between);
        if (rel) addRel(relations, rel.passive ? B.ent : A.ent, rel.type, rel.passive ? A.ent : B.ent, mentions[i + 1]?.ent, between, c.slice(B.end, mentions[i + 1]?.at));
      }
      // "Behind the throne stands an altar": the relation leads the clause
      const lead = relIn(c.slice(0, mentions[0].at));
      if (lead && !lead.passive && mentions.length >= 2) addRel(relations, mentions[1].ent, lead.type, mentions[0].ent);
      // "..., with statues flanking it" / "surrounded by bones"
      if (mentions.length === 1 && lastHead && mentions[0].ent !== lastHead) {
        const after = c.slice(mentions[0].end);
        const rel = relIn(c.slice(0, mentions[0].at)) || relIn(after);
        if (rel) addRel(relations, mentions[0].ent, rel.type, lastHead);
      }
      if (mentions[0].ent.kind !== "room") lastHead = mentions[0].ent;
    }
  }
  // unknown nouns only count when something relates to them
  const used = new Set(relations.flatMap((r) => [r.a, r.b, r.c].filter(Boolean)));
  const kept = entities.filter((e) => e.concept || used.has(e));
  return { entities: kept.map(({ id, concept, noun, count, countGiven, adjs, where, kind, roomRef, definite, ring }) => ({ id, concept, noun, count, countGiven, adjs, where, kind, roomRef, definite, ring })), relations: relations.filter((r) => kept.includes(r.a) && kept.includes(r.b)).map((r) => ({ a: r.a.id, type: r.type, b: r.b.id, c: r.c?.id || null })) };

  function relIn(t) {
    for (const [type, re] of PASSIVE) if (re.test(t)) return { type, passive: true };
    let best = null, at = Infinity;
    for (const [type, re] of RELATIONS) { const m = re.exec(t); if (m && (m.index < at || (m.index === at && m[0].length > best.len))) { at = m.index; best = { type, len: m[0].length }; } }
    return best ? { type: best.type, passive: false } : null;
  }
  function addRel(list, a, type, b, next, between = "", after = "") {
    if (!a || !b || a === b) return;
    if (type === "between" && next) list.push({ a, type, b, c: next });
    else list.push({ a, type, b });
  }
  function findMentions(c, ents, last) {
    const out = [];
    const taken = new Array(c.length).fill(false);
    // known phrases, longest first
    for (const [w, id] of PHRASES) {
      const re = new RegExp(`\\b${w.replace(/[-]/g, "[- ]?")}(e?s)?\\b`, "g");
      let m;
      while ((m = re.exec(c))) {
        if (taken.slice(m.index, m.index + m[0].length).some(Boolean)) continue;
        // a thing is named after a determiner, number, possessive or adjective, at the start, or in the plural;
        // otherwise the word is probably a verb ("the altar stands") or part of a phrase ("as well")
        const before = c.slice(Math.max(0, m.index - 40), m.index);
        const named = /(^\s*|\b(a|an|the|two|three|four|five|six|seven|eight|nine|ten|several|some|many|few|its|their|his|her|our|of|and|or|with|pair of|rows? of|dozens? of|[a-z]+'s)\s+(?:[a-z-]+\s+){0,2})$/.test(before) || !!m[1] && !NOT_NOUN.test(m[0]);
        if (!named || NOT_NOUN.test(m[0])) continue;
        taken.fill(true, m.index, m.index + m[0].length);
        out.push({ at: m.index, end: m.index + m[0].length, id, plural: !!m[1] || w.endsWith("s") && /bones|stairs|steps|runes|webs|supplies|shelves|remains|bodies|skulls|gates/.test(w) });
      }
    }
    // typos and unknown nouns after a determiner or number
    const det = /\b(a|an|the|two|three|four|five|six|several|some|many|few|pair of|row of|rows of|single|lone|its|their)\s+((?:[a-z-]+\s+){0,2}?)([a-z-]{3,})\b/g;
    let m;
    while ((m = det.exec(c))) {
      const start = m.index + m[0].length - m[3].length;
      if (taken[start]) continue;
      const word = m[3], sing = singular(word);
      if (STOP.has(word) || STOP.has(sing) || NOT_NOUN.test(word) || /ly$|ing$|ed$|est$|ful$|ous$/.test(word) && !/chest|forest/.test(word) || ADJ.test(word)) { ADJ.lastIndex = 0; continue; }
      ADJ.lastIndex = 0;
      const typo = SINGLE_WORDS.find(([w]) => near1(sing, w) || near1(word, w));
      taken.fill(true, start, start + word.length);
      out.push({ at: start, end: start + word.length, id: typo ? typo[1] : null, noun: sing, plural: word !== sing });
    }
    out.sort((a, b) => a.at - b.at);
    // pronouns
    const pro = /\b(it|them)\b/g;
    while ((m = pro.exec(c))) if (last && !taken[m.index]) out.push({ at: m.index, end: m.index + m[0].length, pronoun: true });
    out.sort((a, b) => a.at - b.at);
    return out.map((o) => {
      if (o.pronoun) return { ...o, ent: last };
      const concept = o.id ? CONCEPTS[o.id] : null;
      const pre = c.slice(Math.max(0, o.at - 40), o.at);
      const nm = /\b(a|an|one|single|lone|two|pair of|both|twin|three|four|five|six|seven|eight|nine|ten|several|some|many|few|dozen|rows? of)\s+(?:[a-z-]+\s+){0,2}$/.exec(pre);
      let count = nm ? NUMS[nm[1].replace(/ of$/, "").replace("rows", "rows")] || 1 : o.plural ? 3 : 1;
      if (/\d+\s+(?:[a-z-]+\s+){0,2}$/.test(pre)) count = +/(\d+)\s+(?:[a-z-]+\s+){0,2}$/.exec(pre)[1];
      const adjs = (pre.slice(-30).match(ADJ) || []).map((x) => x.trim());
      const noun = o.noun || CONCEPTS[o.id]?.words.find((w) => c.slice(o.at, o.end).startsWith(w.split(" ")[0])) || o.id;
      const definite = /\b(the|its|their)\s+(?:[a-z-]+\s+){0,2}$/.test(pre);
      // the words right before the noun describe it ("dragon statue", "merchant's wagon")
      const mods = (/(?:\b(?:a|an|the|its|their|two|three|four|five|several|some|many|few|pair of|of)\s+)((?:[a-z'-]+\s+){1,2})$/.exec(pre)?.[1] || "").trim().split(/\s+/).filter((x) => x && !NUMS[x]);
      // only the words after the last verb or linking word describe the noun
      const cut = mods.reduce((k, x, i) => (NOT_NOUN.test(x) || /^(of|and|or|with|is|are|was|were|in|on|at|by|has|have|had|to|the|a|an)$/.test(x) || /ed$/.test(x) && !ADJ_OK.test(x) ? i + 1 : k), 0);
      mods.splice(0, cut);
      const phrase = [...mods, singular(c.slice(o.at, o.end).trim())].join(" ").replace(/^(stone|wooden|iron) (stone|wooden|iron) /, "$1 ");
      // "the throne" again refers to the same throne
      let ent = definite ? ents.find((e) => (o.id ? e.concept === o.id : e.noun.endsWith(noun))) : null;
      if (!ent) {
        ent = { id: `e${ents.length + 1}`, concept: o.id, noun: phrase || noun, count: Math.max(1, Math.min(24, count)), countGiven: !!nm || /\d+\s+(?:[a-z-]+\s+){0,2}$/.test(pre), adjs, where: null, kind: concept?.kind || "obj", definite, ring: /^\s*ringed\b/.test(c.slice(o.end)) };
        if (ent.kind === "room") ent.roomRef = /\b(largest|biggest|main|great|grand|central)\b/.test(pre) ? "big" : /\b(small|smallest|side|little|tiny)\b/.test(pre) ? "small" : /\b(first|entrance|outer|front)\b/.test(pre) ? "first" : /\b(last|far|inner|back|deepest|final)\b/.test(pre) ? "last" : null;
        ents.push(ent);
      }
      return { ...o, ent };
    }).filter((o) => o.ent);
  }
}

export function describeScene(scene) {
  const byId = Object.fromEntries(scene.entities.map((e) => [e.id, e]));
  const name = (e) => `${e.count > 1 ? e.count + " " : ""}${e.noun}${e.count > 1 && !/s$/.test(e.noun) ? "s" : ""}`;
  const REL = { cross: "crossing", on: "on", in: "in", behind: "behind", front: "in front of", beside: "beside", across: "across from", between: "between", around: "around", flank: "flanking", line: "lining", end: "at the end of", n: "north of", s: "south of", e: "east of", w: "west of" };
  const parts = scene.relations.map((r) => `${name(byId[r.a])} ${REL[r.type]} the ${byId[r.b].noun}${r.c ? ` and the ${byId[r.c].noun}` : ""}`);
  const related = new Set(scene.relations.flatMap((r) => [r.a, r.b, r.c]));
  for (const e of scene.entities) if (!related.has(e.id) && e.kind !== "area" && e.kind !== "room") parts.push(name(e) + (e.where ? ` (${{ n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest", c: "center", far: "far end" }[e.where]})` : ""));
  return parts.join("; ");
}

// ---------------------------------------------------------------
// placement
// ---------------------------------------------------------------
const WALK = ".cb,s=fw^";
export function placeScene(m, scene, r, { entranceDir = null, outdoors = false } = {}) {
  if (!scene?.entities?.length) return;
  const W = m.w, H = m.h;
  const c = m.cells.split("");
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? " " : c[y * W + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) c[y * W + x] = v; };
  const occupied = new Set();
  const free = (x, y) => WALK.includes(get(x, y)) && !occupied.has(y * W + x) && !"+S".includes(get(x, y));
  const ents = Object.fromEntries(scene.entities.map((e) => [e.id, { ...e, at: null, cells: [] }]));
  const label = (x, y, text) => m.labels.push({ x: Math.max(0, Math.min(W - 3, x)), y: Math.max(0, Math.min(H - 1, y)), text: text[0].toUpperCase() + text.slice(1), public: false });
  const rooms = (m.rooms || []).filter((rm) => rm.w && rm.h);

  // which way is "front": toward the entrance (or the first stairs), else south
  const entLabel = m.labels.find((l) => /^(Entrance|Cave mouth|Gate|Way in)$/.test(l.text));
  const stairs = c.indexOf("S");
  const entry = entLabel ? [entLabel.x, entLabel.y] : stairs >= 0 && !outdoors ? [stairs % W, Math.floor(stairs / W)] : entranceDir ? edgePoint(entranceDir) : [W >> 1, H - 1];
  function edgePoint(d) { return [d.includes("e") ? W - 1 : d.includes("w") ? 0 : W >> 1, d.includes("n") ? 0 : d.includes("s") ? H - 1 : H >> 1]; }
  const aim = (d) => d === "far" ? [Math.round(W - 1 - entry[0] * 0.8 - W * 0.1), Math.round(H - 1 - entry[1] * 0.8 - H * 0.1)].map((v, i) => Math.max(2, Math.min((i ? H : W) - 3, v))) : [d.includes("e") ? Math.round(W * 0.82) : d.includes("w") ? Math.round(W * 0.18) : W >> 1, d.includes("n") ? Math.round(H * 0.18) : d.includes("s") ? Math.round(H * 0.82) : H >> 1];
  const roomOf = (x, y) => rooms.find((rm) => x >= rm.x && x < rm.x + rm.w && y >= rm.y && y < rm.y + rm.h);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // where existing areas are (placed by the map's own passes)
  const anchorOf = (e) => {
    const cpt = CONCEPTS[e.concept] || {};
    if (e.kind === "room") {
      if (!rooms.length) return null;
      const byDist = [...rooms].sort((a, b) => dist([a.x + a.w / 2, a.y + a.h / 2], entry) - dist([b.x + b.w / 2, b.y + b.h / 2], entry));
      const rm = e.roomRef === "big" ? rooms.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b)) : e.roomRef === "small" ? rooms.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b)) : e.roomRef === "first" ? byDist[0] : e.roomRef === "last" ? byDist.at(-1) : e.where ? rooms.reduce((a, b) => (dist([a.x + a.w / 2, a.y + a.h / 2], aim(e.where)) <= dist([b.x + b.w / 2, b.y + b.h / 2], aim(e.where)) ? a : b)) : rooms.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
      return { pt: [rm.x + (rm.w >> 1), rm.y + (rm.h >> 1)], room: rm };
    }
    const names = [].concat(cpt.findLabel || []);
    const l = names.length && m.labels.find((x) => names.includes(x.text));
    if (l) return { pt: [l.x, l.y] };
    if (e.concept === "entrance") return { pt: entry };
    if (cpt.find) {
      const ch = cpt.find === "water" ? "~w" : cpt.find;
      let best = null, bd = Infinity;
      const ref = e.where ? aim(e.where) : [W >> 1, H >> 1];
      for (let i = 0; i < c.length; i++) if (ch.includes(c[i])) { const d = dist([i % W, Math.floor(i / W)], ref); if (d < bd) { bd = d; best = i; } }
      if (best !== null) return { pt: [best % W, Math.floor(best / W)] };
    }
    return null;
  };

  // nearest free square to a point, optionally inside a room
  const nearest = (pt, { inRoom = null, need = 1, horizontal = true, water = false } = {}) => {
    let best = null, bd = Infinity;
    const ok = (x, y) => {
      for (let k = 0; k < need; k++) {
        const xx = x + (horizontal ? k : 0), yy = y + (horizontal ? 0 : k);
        if (water ? !"~w".includes(get(xx, yy)) || occupied.has(yy * W + xx) : !free(xx, yy)) return false;
        if (inRoom && !(xx >= inRoom.x && xx < inRoom.x + inRoom.w && yy >= inRoom.y && yy < inRoom.y + inRoom.h)) return false;
      }
      return true;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!ok(x, y)) continue;
      const d = dist([x, y], pt);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  };
  const step = (from, toward, n) => { const d = dist(from, toward) || 1; return [Math.round(from[0] + ((toward[0] - from[0]) / d) * n), Math.round(from[1] + ((toward[1] - from[1]) / d) * n)]; };
  const DIRV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  // order: referents first
  const order = [];
  const seen = new Set();
  const visit = (id, depth = 0) => {
    if (seen.has(id) || depth > 20) return;
    seen.add(id);
    for (const rel of scene.relations) if (rel.a === id) { visit(rel.b, depth + 1); if (rel.c) visit(rel.c, depth + 1); }
    order.push(id);
  };
  for (const e of scene.entities) visit(e.id);

  let lastPlaced = null;
  for (const id of order) {
    const e = ents[id];
    const cpt = CONCEPTS[e.concept] || { kind: "obj", glyph: "t" };
    if (cpt.terrain) {
      // a patch of lava or ice where the description puts it
      const rel = scene.relations.find((x) => x.a === id && (ents[x.b].at || ents[x.b].room));
      const B = rel ? ents[rel.b].at || [ents[rel.b].room.x + (ents[rel.b].room.w >> 1), ents[rel.b].room.y + (ents[rel.b].room.h >> 1)] : null;
      const pt = nearest(B ? [B[0] + 3, B[1]] : e.where ? aim(e.where) : [W >> 1, H >> 1]) || [W >> 1, H >> 1];
      const rad = /\b(large|huge|great|massive|lake|river|sea)\b/.test(e.noun) ? 4 : 2;
      for (let y = pt[1] - rad; y <= pt[1] + rad; y++) for (let x = pt[0] - rad - 1; x <= pt[0] + rad + 1; x++) if (Math.hypot((x - pt[0]) / 1.3, y - pt[1]) <= rad + r() * 0.6 && WALK.includes(get(x, y))) set(x, y, cpt.terrain);
      if (e.concept === "lava") (m.lights ||= []).push({ id: `l${m.lights.length + 1}`, x: pt[0], y: pt[1], r: rad + 1 });
      e.at = pt; label(pt[0], pt[1], e.noun);
      continue;
    }
    // "the palm trees", "the pillars": things the map already has, when nothing says where they go
    if (e.definite && cpt.find && !scene.relations.some((x) => x.a === id)) {
      const ref = e.where ? aim(e.where) : [W >> 1, H >> 1];
      let best = null, bd = Infinity;
      for (let i = 0; i < c.length; i++) if (c[i] === cpt.find) { const d = dist([i % W, Math.floor(i / W)], ref); if (d < bd) { bd = d; best = i; } }
      if (best !== null) { e.at = [best % W, Math.floor(best / W)]; e.room = roomOf(...e.at); continue; }
    }
    if (e.kind === "area" || e.kind === "room") { const a = anchorOf(e); if (a) { e.at = a.pt; e.room = a.room || roomOf(...a.pt); } continue; }
    if (e.concept === "altar" && m.altarPlaced) { const l = m.labels.find((x) => x.text === "Altar"); if (l) { e.at = [l.x, l.y + 1]; continue; } }
    if (cpt.pattern === "bridge") {
      const over = scene.relations.find((x) => x.a === id && ["cross", "across", "on", "over", "in"].includes(x.type) && ents[x.b].at);
      const B = over ? ents[over.b].at : null;
      const gap = (v) => "~wLvI".includes(v);
      let pt = B;
      if (!pt || !gap(get(...pt))) { let best = null, bd = Infinity; const ref = B || [W >> 1, H >> 1]; for (let i = 0; i < c.length; i++) if ("~Lv".includes(c[i])) { const d = dist([i % W, Math.floor(i / W)], ref); if (d < bd) { bd = d; best = i; } } pt = best === null ? null : [best % W, Math.floor(best / W)]; }
      if (pt) {
        // span the shorter way across
        const run = (dx, dy) => { let n = 0; for (let k = -12; k <= 12; k++) if (gap(get(pt[0] + dx * k, pt[1] + dy * k))) n++; return n; };
        const [dx, dy] = run(1, 0) <= run(0, 1) ? [1, 0] : [0, 1];
        for (const sgn of [1, -1]) for (let k = sgn > 0 ? 0 : 1; k < 14; k++) { const x = pt[0] + dx * k * sgn, y = pt[1] + dy * k * sgn; if (!gap(get(x, y))) break; set(x, y, "b"); occupied.add(y * W + x); }
        e.at = pt; label(pt[0], pt[1] - 1, e.noun);
      }
      continue;
    }
    const rels = scene.relations.filter((rel) => rel.a === id).map((rel) => ({ ...rel, B: ents[rel.b], C: rel.c ? ents[rel.c] : null })).filter((rel) => rel.B.at || rel.B.room);
    // target point and constraints
    let target = e.where ? aim(e.where) : null, inRoom = null, mode = "single";
    const room = roomOf(...(target || [-1, -1]));
    for (const rel of rels) {
      const B = rel.B.at || [rel.B.room.x + (rel.B.room.w >> 1), rel.B.room.y + (rel.B.room.h >> 1)];
      const bRoom = rel.B.room || roomOf(...B);
      switch (rel.type) {
        case "in": case "on": target = B; inRoom = bRoom || null; break;
        case "behind": target = step(B, [2 * B[0] - entry[0], 2 * B[1] - entry[1]], 2); inRoom = bRoom; break;
        case "front": target = step(B, entry, 2); inRoom = bRoom; break;
        case "beside": target = [B[0] + (r() < 0.5 ? 2 : -2), B[1]]; inRoom = bRoom; break;
        case "across": target = bRoom ? [2 * (bRoom.x + bRoom.w / 2) - B[0], 2 * (bRoom.y + bRoom.h / 2) - B[1]].map(Math.round) : step(B, [W - B[0], H - B[1]], Math.min(W, H) / 3); inRoom = bRoom; break;
        case "between": { const C = rel.C?.at || B; target = [Math.round((B[0] + C[0]) / 2), Math.round((B[1] + C[1]) / 2)]; break; }
        case "end": target = bRoom ? (dist([bRoom.x, bRoom.y], entry) > dist([bRoom.x + bRoom.w - 1, bRoom.y + bRoom.h - 1], entry) ? [bRoom.x + 1, bRoom.y + 1] : [bRoom.x + bRoom.w - 2, bRoom.y + bRoom.h - 2]) : step(B, [2 * B[0] - entry[0], 2 * B[1] - entry[1]], 4); inRoom = bRoom; break;
        case "around": mode = "ring"; target = B; break;
        case "flank": mode = "flank"; target = B; inRoom = bRoom; break;
        case "line": mode = "line"; target = B; inRoom = bRoom; break;
        default: if (DIRV[rel.type]) { target = [B[0] + DIRV[rel.type][0] * 4, B[1] + DIRV[rel.type][1] * 4]; }
      }
      if (inRoom === undefined) inRoom = null;
    }
    if (!target && !inRoom) {
      // a room named for it ("the throne room"), else beside what was placed last, else the main room
      const named = Object.values(ents).find((x) => x.kind === "room" && x.room && cpt.words?.some((w) => x.noun.includes(w)));
      if (named) inRoom = named.room;
      else if (lastPlaced) { target = [lastPlaced.at[0] + (r() < 0.5 ? 3 : -3), lastPlaced.at[1] + (r() < 0.5 ? 2 : -2)]; inRoom = lastPlaced.room || null; }
      else if (rooms.length && !outdoors) inRoom = rooms.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    }
    if (!target) target = inRoom ? [inRoom.x + (inRoom.w >> 1), inRoom.y + (inRoom.h >> 1)] : room ? [room.x + (room.w >> 1), room.y + (room.h >> 1)] : [Math.floor(r() * (W - 6)) + 3, Math.floor(r() * (H - 6)) + 3];
    if (e.ring) mode = "ring";
    target = [Math.max(1, Math.min(W - 2, target[0])), Math.max(1, Math.min(H - 2, target[1]))];

    const putObj = (pt, text) => {
      const w = cpt.w || 1, h = cpt.h || 1;
      const p = nearest(pt, { inRoom, need: Math.max(w, h), horizontal: w >= h, water: !!cpt.water }) || nearest(pt, { need: 1, water: !!cpt.water });
      if (!p) return null;
      if (cpt.kind === "struct") return putStruct(p, text);
      if (cpt.pattern === "fountain") { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (free(p[0] + dx, p[1] + dy)) set(p[0] + dx, p[1] + dy, "w"); set(p[0], p[1], "p"); }
      else if (cpt.pattern === "well") { set(p[0], p[1], "~"); }
      else if (cpt.pattern === "circle") { for (let a = 0; a < 12; a++) { const x = Math.round(p[0] + Math.cos((a / 12) * 6.283) * 2), y = Math.round(p[1] + Math.sin((a / 12) * 6.283) * 2); if (free(x, y)) set(x, y, "o"); } }
      else if (cpt.glyph) for (let k = 0; k < Math.max(w, h); k++) set(p[0] + (w >= h ? k : 0), p[1] + (w >= h ? 0 : k), cpt.glyph);
      for (let k = 0; k < Math.max(w, h); k++) occupied.add((p[1] + (w >= h ? 0 : k)) * W + p[0] + (w >= h ? k : 0));
      if (cpt.light) (m.lights ||= []).push({ id: `l${m.lights.length + 1}`, x: p[0], y: p[1], r: cpt.light });
      if (text) label(p[0], p[1] - 1, text);
      return p;
    };
    const putStruct = (pt, text) => {
      const bw = cpt.w || 5, bh = cpt.h || 4;
      // find a clear patch of ground for the whole building
      let best = null, bd = Infinity;
      for (let y = 1; y < H - bh - 1; y++) for (let x = 1; x < W - bw - 1; x++) {
        let ok = true;
        for (let j = y - 1; j <= y + bh && ok; j++) for (let i = x - 1; i <= x + bw && ok; i++) if (!WALK.includes(get(i, j)) || occupied.has(j * W + i)) ok = false;
        if (!ok) continue;
        const d = dist([x + bw / 2, y + bh / 2], pt);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (!best) return null;
      const [x0, y0] = best;
      const ruined = /\b(ruined|crumbling|collapsed|broken|burned|burnt|abandoned|ramshackle|rickety)\b/.test(e.noun);
      for (let j = y0; j < y0 + bh; j++) for (let i = x0; i < x0 + bw; i++) { const edge = i === x0 || j === y0 || i === x0 + bw - 1 || j === y0 + bh - 1; set(i, j, edge ? (ruined && r() < 0.3 ? "^" : "#") : ruined && r() < 0.2 ? "^" : cpt.floor || "b"); occupied.add(j * W + i); }
      // door toward the middle of the map (or the entrance)
      const ddx = entry[0] - (x0 + bw / 2), ddy = entry[1] - (y0 + bh / 2);
      const door = Math.abs(ddx) > Math.abs(ddy) ? [ddx > 0 ? x0 + bw - 1 : x0, y0 + (bh >> 1)] : [x0 + (bw >> 1), ddy > 0 ? y0 + bh - 1 : y0];
      set(door[0], door[1], "+");
      if (cpt.stairs) set(x0 + 1, y0 + 1, "S");
      if (text) label(x0 + 1, y0 + 1, text);
      return [x0 + (bw >> 1), y0 + (bh >> 1)];
    };

    const text = e.noun;
    const n = e.count || 1;
    if (mode === "ring") {
      const rad = Math.max(2, Math.min(5, Math.ceil(n / 3) + 1));
      const ringN = e.countGiven ? n : Math.max(n, 6);
      for (let k = 0; k < ringN; k++) { const a = (k / ringN) * 6.283; const pt = [Math.round(target[0] + Math.cos(a) * rad), Math.round(target[1] + Math.sin(a) * rad)]; const p = putObj(pt, k === 0 ? text : null); if (k === 0) e.at = p; }
    } else if (mode === "flank") {
      const toEntry = [entry[0] - target[0], entry[1] - target[1]];
      const across = Math.abs(toEntry[0]) > Math.abs(toEntry[1]) ? [0, 2] : [2, 0];
      const pairs = Math.max(1, Math.ceil(n / 2));
      for (let k = 0; k < pairs; k++) for (const sgn of [-1, 1]) { const p = putObj([target[0] + across[0] * sgn + (across[0] ? 0 : k * 2 * Math.sign(toEntry[0] || 1)), target[1] + across[1] * sgn + (across[1] ? 0 : k * 2 * Math.sign(toEntry[1] || 1))], k === 0 && sgn === -1 ? text : null); if (!e.at) e.at = p; }
    } else if (mode === "line") {
      const rm = inRoom;
      const n2 = Math.max(n, rm ? Math.floor(Math.max(rm.w, rm.h) / 2) : 4);
      for (let k = 0; k < n2; k++) {
        const pt = rm ? (rm.w >= rm.h ? [rm.x + 1 + Math.round((k / Math.max(1, n2 - 1)) * (rm.w - 3)), k % 2 ? rm.y : rm.y + rm.h - 1] : [k % 2 ? rm.x : rm.x + rm.w - 1, rm.y + 1 + Math.round((k / Math.max(1, n2 - 1)) * (rm.h - 3))]) : [target[0] - n2 + k * 2, target[1] + (k % 2 ? -2 : 2)];
        const p = putObj(pt, k === 0 ? text : null);
        if (k === 0) e.at = p;
      }
    } else {
      for (let k = 0; k < n; k++) {
        const pt = k === 0 ? target : [target[0] + ((k % 3) - 1) * 2, target[1] + Math.floor(k / 3) * 2 * (k % 2 ? 1 : -1)];
        const p = putObj(pt, k === 0 ? text : null);
        if (k === 0) e.at = p;
      }
    }
    if (e.at) { e.room = roomOf(...e.at); lastPlaced = e; }
  }
  m.cells = c.join("");
}
