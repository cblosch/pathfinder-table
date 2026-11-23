// Maps from a description. A description is turned into a plan (map type,
// size, room count and features), and the plan is built with the regular
// generators plus feature passes. Reading the description works offline with
// keywords; when the AI is available it can read the description instead and
// return the same kind of plan. Either way the GM sees what was understood.
import { generateMap, rng, MAP_TYPES } from "./map.js";

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1, an: 1, single: 1, couple: 2, few: 3, several: 4, many: 8, dozen: 12 };
const num = (s) => (/^\d+$/.test(s) ? +s : NUM[s.toLowerCase()]);

// What each feature does and the words that ask for it
export const FEATURES = {
  river: { label: "river", words: /\b(river|stream|creek|brook|underground stream|channel)\b/ },
  lake: { label: "lake or pool", words: /\b(lake|pond|pool|pools|lagoon|cistern|flooded|underground lake|reservoir|spring)\b/ },
  bridge: { label: "bridge", words: /\bbridges?\b/ },
  chasm: { label: "chasm", words: /\b(chasm|pit|pits|rift|crevasse|abyss|sinkhole|gorge)\b/ },
  pillars: { label: "pillars", words: /\b(pillars?|columns?|colonnade|pillared)\b/ },
  altar: { label: "altar", words: /\b(altar|shrine|sanctum|chapel|temple|ritual)\b/ },
  statue: { label: "statue", words: /\b(statues?|idol|monument|obelisk|fountain)\b/ },
  rubble: { label: "rubble", words: /\b(rubble|collapsed|ruined|ruins|crumbling|caved[- ]in|debris)\b/ },
  ruins: { label: "ruins", words: /\b(ruins|ruined|abandoned (fort|tower|keep|village)|old foundations)\b/ },
  camp: { label: "camp", words: /\b(camp|campsite|campfire|bonfire|tents?|bandit camp|encampment)\b/ },
  road: { label: "road", words: /\b(road|path|trail|highway|track)\b/ },
  noRoad: { label: "no road", words: /\b(no road|trackless|pathless|wild)\b/ },
  stairs: { label: "stairs", words: /\b(stairs?|staircase|steps|ladders?)\b/ },
  furniture: { label: "furniture", words: /\b(tables?|benches|desks?|shelves|bookshelves|library|barracks|beds|crates|barrels)\b/ },
  swamp: { label: "swamp", words: /\b(swamp|marsh|bog|fen|mire|wetland)\b/ },
  sand: { label: "sand", words: /\b(desert|beach|dunes?|sandy|shore|coast)\b/ },
  denseTrees: { label: "dense trees", words: /\b(dense|thick|deep|dark) (forest|woods|jungle)|\bjungle\b|\boverg?rown\b/ },
  openGround: { label: "open ground", words: /\b(field|meadow|plains?|grassland|clearing|hill|hills|open)\b/ },
};

const TYPE_WORDS = [
  ["tavern", /\b(tavern|inn|alehouse|pub|shop|store|house|home|manor house|interior|hall|mansion|guildhall|cottage|warehouse)\b/],
  ["town", /\b(town|village|city|hamlet|market|streets?|square|docks|harbou?r|district|settlement)\b/],
  ["cave", /\b(cave|caves|cavern|caverns|grotto|mine|mines|tunnels?|burrow|lair|underdark|warren)\b/],
  ["dungeon", /\b(dungeon|crypt|tomb|catacombs?|vault|sewers?|fortress|castle|keep|prison|jail|cellar|basement|labyrinth|maze|temple|library|barracks|sanctum|halls|chambers|rooms)\b/],
  ["wilderness", /\b(forest|woods|wood|jungle|swamp|marsh|bog|field|meadow|road|trail|river|hill|hills|mountain|pass|clearing|camp|coast|beach|desert|plains?|wilderness|grove|glade|valley|ravine)\b/],
];

/** Read a description with keywords. Returns a plan. */
export function planFromText(text, { fallbackType = "dungeon", name = "" } = {}) {
  const t = ` ${String(text || "").toLowerCase()} `;
  // type: the earliest strong match wins, so "a cave beneath the town" is a cave
  let type = null, at = Infinity;
  for (const [k, re] of TYPE_WORDS) { const m = re.exec(t); if (m && m.index < at) { at = m.index; type = k; } }
  if (/\b(beneath|under|below|underground)\b/.test(t) && /\b(cave|cavern|tunnel|grotto)\b/.test(t)) type = "cave";
  type ||= fallbackType;
  const size = /\b(tiny|small|cramped|little|narrow|short)\b/.test(t) ? "small" : /\b(huge|vast|sprawling|large|big|massive|enormous|great)\b/.test(t) ? "large" : "medium";
  const countOf = (re) => { const m = re.exec(t); return m ? num(m[1]) : null; };
  const rooms = countOf(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|few|couple|dozen)\s+(?:\w+\s)?(?:rooms|chambers|cells|halls|vaults|crypts)\b/);
  const buildings = countOf(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|few|couple|dozen)\s+(?:\w+\s)?(?:buildings|houses|homes|huts|cottages|shops)\b/);
  const features = Object.keys(FEATURES).filter((f) => FEATURES[f].words.test(t));
  return normalizePlan({ type, size, rooms, buildings, features, name });
}

export function normalizePlan(p = {}) {
  const type = MAP_TYPES[p.type] ? p.type : "dungeon";
  const size = ["small", "medium", "large"].includes(p.size) ? p.size : "medium";
  const features = [...new Set((p.features || []).filter((f) => FEATURES[f]))];
  const clamp = (n, a, b) => (Number.isFinite(+n) && n !== null ? Math.max(a, Math.min(b, Math.round(+n))) : null);
  return { type, size, rooms: clamp(p.rooms, 1, 20), buildings: clamp(p.buildings, 1, 30), features, name: String(p.name || "").slice(0, 80) };
}

export function describePlan(p) {
  const bits = [MAP_TYPES[p.type], `${p.size} size`];
  if (p.rooms) bits.push(`${p.rooms} room${p.rooms > 1 ? "s" : ""}`);
  if (p.buildings) bits.push(`${p.buildings} buildings`);
  if (p.features.length) bits.push(p.features.map((f) => FEATURES[f].label).join(", "));
  return bits.join(" · ");
}

// Sizes per map type: [small, medium, large]
const DIMS = {
  dungeon: [[32, 24], [44, 32], [60, 42]], cave: [[34, 26], [46, 34], [62, 44]], wilderness: [[32, 24], [44, 32], [60, 42]],
  town: [[40, 30], [50, 36], [64, 46]], tavern: [[26, 20], [32, 24], [40, 30]],
};

/** Build a map from a plan. */
export function mapFromPlan(plan, seed = Math.floor(Math.random() * 1e9)) {
  const p = normalizePlan(plan);
  const [w, hh] = DIMS[p.type][["small", "medium", "large"].indexOf(p.size)];
  const opts = { w, h: hh, name: p.name || MAP_TYPES[p.type] };
  if (p.type === "dungeon" && p.rooms) opts.rooms = p.rooms;
  const m = generateMap(p.type, seed, opts);
  const r = rng(seed ^ 0x5bd1e995);
  applyFeatures(m, p, r);
  m.plan = p;
  return m;
}

// ---------------------------------------------------------------
// feature passes, working on the finished cell grid
// ---------------------------------------------------------------
const FLOORS = ".cb,s=fw^";
function applyFeatures(m, p, r) {
  const c = m.cells.split("");
  const W = m.w, H = m.h;
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? " " : c[y * W + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) c[y * W + x] = v; };
  const has = (f) => p.features.includes(f);
  const floorIdx = () => c.map((v, i) => (FLOORS.includes(v) ? i : -1)).filter((i) => i >= 0);
  const label = (x, y, text, pub = false) => m.labels.push({ x, y, text, public: pub });
  const outdoors = p.type === "wilderness" || p.type === "town";
  const base = p.type === "cave" ? "c" : p.type === "dungeon" ? "." : p.type === "tavern" ? "b" : ",";
  // the biggest room (or a central open spot) is where set pieces go
  const rooms = (m.rooms || []).filter((rm) => rm.w && rm.h);
  const big = rooms.length ? rooms.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b)) : null;
  const center = () => {
    if (big) return [big.x + (big.w >> 1), big.y + (big.h >> 1)];
    const open = floorIdx();
    const mid = open.sort((a, b) => Math.hypot(a % W - W / 2, Math.floor(a / W) - H / 2) - Math.hypot(b % W - W / 2, Math.floor(b / W) - H / 2))[0];
    return mid === undefined ? [W >> 1, H >> 1] : [mid % W, Math.floor(mid / W)];
  };
  // a spot for a secondary feature: the center of another room, or a random open cell
  const usedRooms = new Set(big ? [big] : []);
  const spot = () => {
    const free = rooms.filter((rm) => !usedRooms.has(rm) && rm.w >= 4 && rm.h >= 3);
    if (free.length) { const rm = free[ri(0, free.length - 1)]; usedRooms.add(rm); return [rm.x + (rm.w >> 1), rm.y + (rm.h >> 1)]; }
    const open = floorIdx();
    if (!open.length) return [W >> 1, H >> 1];
    const i = open[ri(0, open.length - 1)];
    return [i % W, Math.floor(i / W)];
  };

  // ground cover
  if (outdoors && (has("swamp") || has("sand") || has("denseTrees") || has("openGround"))) {
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (has("swamp") && (v === "," || v === "s") && r() < 0.32) c[i] = r() < 0.6 ? "w" : "f";
      if (has("sand") && (v === "," || v === "f") && r() < 0.75) c[i] = "s";
      if (has("denseTrees") && v === "," && r() < 0.3) c[i] = r() < 0.6 ? "T" : "f";
      if (has("openGround") && !has("denseTrees") && (v === "T" || v === "f") && r() < 0.7) c[i] = ",";
    }
  }
  if (p.type === "wilderness" && has("noRoad")) for (let i = 0; i < c.length; i++) if (c[i] === "=") c[i] = ",";

  // water: a river crossing the map, or a lake
  const riverCells = [];
  if (has("river") && !(p.type === "wilderness" && m.cells.includes("~"))) {
    const vertical = r() < 0.5;
    let pos = ri(Math.floor((vertical ? W : H) * 0.3), Math.floor((vertical ? W : H) * 0.7));
    for (let t = 0; t < (vertical ? H : W); t++) {
      pos += ri(-1, 1);
      for (let d = -2; d <= 2; d++) {
        const [x, y] = vertical ? [pos + d, t] : [t, pos + d];
        const v = get(x, y);
        if (v === " " || v === "#") { if (p.type === "cave" && Math.abs(d) <= 1) set(x, y, Math.abs(d) < 1 ? "~" : "w"); continue; }
        if (v === "+" || v === "S") continue;
        set(x, y, Math.abs(d) <= 0 ? "~" : Math.abs(d) <= 1 ? "w" : v);
        if (Math.abs(d) <= 1) riverCells.push([x, y]);
      }
    }
  }
  if (has("lake")) {
    const [cx, cy] = has("altar") || has("statue") || has("pillars") ? spot() : center();
    const rad = p.size === "large" ? 5 : p.size === "small" ? 2 : 3;
    let wet = 0;
    for (let y = cy - rad - 1; y <= cy + rad + 1; y++) for (let x = cx - rad - 2; x <= cx + rad + 2; x++) {
      const d = Math.hypot((x - cx) / 1.3, y - cy);
      if (d <= rad + r() * 0.8 && FLOORS.includes(get(x, y)) && get(x, y) !== "+") { set(x, y, d < rad - 1 ? "~" : "w"); wet++; }
    }
    if (wet) label(cx, cy, p.type === "dungeon" ? "Pool" : "Lake");
    // "flooded": standing water spread across the floors as well
    if (!outdoors) for (let i = 0; i < c.length; i++) if (c[i] === base && r() < 0.12) c[i] = "w";
  }
  if (has("bridge")) {
    const water = c.map((v, i) => (v === "~" ? i : -1)).filter((i) => i >= 0);
    if (water.length) {
      const i = water[Math.floor(water.length / 2)];
      const x0 = i % W, y0 = Math.floor(i / W);
      const horizontalRun = get(x0 - 1, y0) !== "~" || get(x0 + 1, y0) !== "~" ? false : true;
      for (let k = -4; k <= 4; k++) {
        const [x, y] = horizontalRun ? [x0, y0 + k] : [x0 + k, y0];
        if ("~w".includes(get(x, y))) set(x, y, "b");
      }
      label(x0, y0, "Bridge", true);
    }
  }
  if (has("chasm")) {
    const [cx0, cy0] = has("altar") || has("statue") || has("pillars") ? spot() : center();
    const cx = Math.max(3, Math.min(W - 4, cx0)), cy = Math.max(3, Math.min(H - 4, cy0));
    let x = cx - ri(4, 8), y = cy;
    for (let k = 0; k < (p.size === "large" ? 18 : 11); k++) {
      for (let d = -1; d <= 1; d++) if (FLOORS.includes(get(x, y + d)) && get(x, y + d) !== "+") { set(x, y + d, Math.abs(d) && r() < 0.4 ? "^" : "v"); }
      x++; y += ri(-1, 1);
    }
    if (c.includes("v")) label(cx, cy, "Chasm");
  }

  // set pieces in the main room / central spot
  if (has("pillars")) {
    const rm = big || { x: 2, y: 2, w: W - 4, h: H - 4 };
    for (let x = rm.x + 1; x < rm.x + rm.w - 1; x += 2) for (const y of [rm.y + 1, rm.y + rm.h - 2]) if (FLOORS.includes(get(x, y))) set(x, y, "p");
  }
  if (has("altar")) { const [x, y] = center(); set(x, y, "t"); set(x + 1, y, "t"); label(x, y - 1, "Altar"); }
  if (has("statue")) { const [x0, y0] = center(); const x = x0 + (has("altar") ? 3 : 0), y = y0; if (FLOORS.includes(get(x, y))) { set(x, y, "p"); label(x, y + 1, "Statue"); } }
  if (has("camp")) {
    const [x, y] = outdoors ? center() : center();
    for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) if (Math.hypot(i / 1.4, j) < 2.6 && "Tf,".includes(get(x + i, y + j))) set(x + i, y + j, outdoors ? "s" : get(x + i, y + j));
    set(x, y, "t"); label(x, y, "Campfire");
    for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) if (FLOORS.includes(get(x + dx, y + dy))) set(x + dx, y + dy, "t");
  }
  if (has("ruins") && outdoors) {
    for (let k = 0; k < (p.size === "large" ? 4 : 2); k++) {
      const bx = ri(3, W - 10), by = ri(3, H - 8), bw = ri(5, 8), bh = ri(4, 6);
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
        const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1;
        if (edge && r() < 0.65 && get(x, y) !== "~") set(x, y, "#");
        else if (!edge && r() < 0.25) set(x, y, "^");
      }
      label(bx, by, "Ruins");
    }
  }
  if (has("rubble")) {
    const open = floorIdx();
    for (let k = 0; k < Math.floor(open.length * 0.04); k++) { const i = open[ri(0, open.length - 1)]; if (c[i] === base) c[i] = "^"; }
  }
  if (has("furniture") && !outdoors) {
    for (const rm of (rooms.length ? rooms : [{ x: 2, y: 2, w: W - 4, h: H - 4 }]).slice(0, 6)) {
      for (let k = 0; k < Math.max(1, Math.floor((rm.w * rm.h) / 14)); k++) {
        const x = ri(rm.x + 1, rm.x + rm.w - 2), y = ri(rm.y + 1, rm.y + rm.h - 2);
        if (FLOORS.includes(get(x, y))) set(x, y, "t");
      }
    }
  }
  if (has("stairs") && !c.includes("S")) { const open = floorIdx(); if (open.length) { const i = open[ri(0, open.length - 1)]; c[i] = "S"; label(i % W, Math.floor(i / W), "Stairs"); } }

  m.cells = c.join("");
  m.fog = "0".repeat(W * H);
}
