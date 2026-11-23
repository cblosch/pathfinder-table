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
  altar: { label: "altar", words: /\b(altars?|sacrificial|sacrifices?|ritual (stone|site|circle)|sanctum)\b/ },
  statue: { label: "statue", words: /\b(statues?|idol|monument|obelisk|fountain)\b/ },
  rubble: { label: "rubble", words: /\b(rubble|collapsed|ruined|ruins|crumbling|caved[- ]in|debris)\b/ },
  ruins: { label: "ruins", words: /\b(ruins|ruined|abandoned (fort|tower|keep|village)|old foundations)\b/ },
  camp: { label: "camp", words: /\b(camp|campsite|campfire|bonfire|tents?|bandit camp|encampment)\b/ },
  road: { label: "road", words: /\b(road|path|trail|highway|track)\b/ },
  noRoad: { label: "no road", words: /\b(no road|trackless|pathless|wild)\b/ },
  ramshackle: { label: "ramshackle buildings", words: /\b(ramshackle|shanty|shanties|shacks?|hovels?|dilapidated|rickety|crumbling)\b/ },
  stairs: { label: "stairs", words: /\b(stairs?|staircase|steps|ladders?)\b/ },
  furniture: { label: "furniture", words: /\b(tables?|benches|desks?|shelves|bookshelves|library|barracks|beds|crates|barrels)\b/ },
  swamp: { label: "swamp", words: /\b(swamp|marsh|bog|fen|mire|wetland)\b/ },
  sand: { label: "sand", words: /\b(desert|beach|dunes?|sandy|shore|coast)\b/ },
  denseTrees: { label: "dense trees", words: /\b(dense|thick|deep|dark) (forest|woods|jungle)|\bjungle\b|\boverg?rown\b/ },
  openGround: { label: "open ground", words: /\b(field|meadow|plains?|grassland|clearing|hill|hills|open)\b/ },
};

const TYPE_WORDS = [
  ["tavern", /\b(tavern|inn|alehouse|pub|shop|store|house|manor house|interior|mansion|guildhall|cottage|warehouse)\b/],
  ["town", /\b(town|village|city|hamlet|market|streets?|square|docks|harbou?r|district|settlement|slums?|shanty ?town|houses|homes|huts|shacks|hovels|cottages|buildings|row of)\b/],
  ["cave", /\b(cave|caves|cavern|caverns|grotto|mine|mines|tunnels?|burrow|lair|underdark|warren)\b/],
  ["dungeon", /\b(dungeon|crypt|tomb|catacombs?|vault|sewers?|fortress|castle|keep|prison|jail|cellar|basement|labyrinth|maze|temple|library|barracks|sanctum|halls|chambers|rooms)\b/],
  ["wilderness", /\b(forest|woods|wood|jungle|swamp|marsh|bog|field|meadow|road|trail|river|hill|hills|mountain|pass|clearing|camp|coast|beach|desert|plains?|wilderness|grove|glade|valley|ravine)\b/],
];

/** Read a description with keywords. Returns a plan. */
export function planFromText(text, { fallbackType = "dungeon", name = "" } = {}) {
  const t = ` ${String(text || "").toLowerCase()} `;
  // type: the earliest strong match wins, so "a cave beneath the town" is a cave
  // the earliest place word wins, but landscape words only decide when nothing
  // else does: a "desert city" is a city, a "forest shrine" is outdoors
  let type = null, at = Infinity;
  for (const [k, re] of TYPE_WORDS) { if (k === "wilderness") continue; const m = re.exec(t); if (m && m.index < at) { at = m.index; type = k; } }
  if (!type && TYPE_WORDS.find(([k]) => k === "wilderness")[1].test(t)) type = "wilderness";
  if (/\b(beneath|under|below|underground)\b/.test(t) && /\b(cave|cavern|tunnel|grotto)\b/.test(t)) type = "cave";
  type ||= fallbackType;
  const size = /\b(tiny|small|cramped|little|narrow|short)\b/.test(t) ? "small" : /\b(huge|vast|sprawling|large|big|massive|enormous|great)\b/.test(t) ? "large" : "medium";
  const countOf = (re) => { const m = re.exec(t); return m ? num(m[1]) : null; };
  const rooms = countOf(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|few|couple|dozen)\s+(?:\w+\s)?(?:rooms|chambers|cells|halls|vaults|crypts)\b/);
  const buildings = countOf(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|few|couple|dozen)\s+(?:\w+\s)?(?:buildings|houses|homes|huts|cottages|shops)\b/);
  const features = Object.keys(FEATURES).filter((f) => FEATURES[f].words.test(t));
  // a temple or chapel interior has an altar even when the word isn't used
  if ((type === "dungeon" || type === "cave") && /\b(temple|chapel|shrine|cathedral)\b/.test(t)) features.push("altar");
  const underground = /\b(underground|subterranean|beneath the (surface|earth|ground|mountain)|below (the )?ground|under the (earth|mountain|city|ground)|in a (vast |huge |great )?(cavern|cave))\b/.test(t);
  const layout = /\b(strip|row of|rows of|line of|lined with|single street|one street|long street|main street|one road|leading (up )?to|along (a|the|one) (\w+ )?(road|street|path|avenue|track|causeway|boardwalk))\b/.test(t) ? "strip" : null;
  const landmark = /\b(ziggurat|pyramid|step pyramid|stepped (temple|pyramid|structure|platform))\b/.test(t) ? "ziggurat" : null;
  const buildingKinds = BUILDING_KINDS.filter(([, re]) => re.test(t)).map(([n]) => n);
  return normalizePlan({ type, size, rooms, buildings, features, name, underground, layout, landmark, buildingKinds });
}

// Building kinds a description can name (towns only label what's asked for)
const BUILDING_KINDS = [
  ["Tavern", /\b(tavern|inn|alehouse|pub)\b/], ["Smithy", /\b(smithy|forge|blacksmith)\b/], ["Temple", /\b(church|cathedral|chapel)\b/],
  ["Shrine", /\bshrines?\b/], ["Shop", /\b(shops?|stores?|market|merchant)\b/], ["Barracks", /\b(barracks|garrison|guard ?house|guard post)\b/],
  ["Jail", /\b(jail|prison|stockade|cells)\b/], ["Warehouse", /\b(warehouses?|storehouses?|granary)\b/], ["Stables", /\bstables?\b/],
  ["Hall", /\b(town hall|meeting hall|longhouse|great hall)\b/], ["Library", /\blibrary\b/], ["Workshop", /\b(workshops?|mill)\b/],
  ["Cult house", /\b(cult(ist)?s?'? (house|hall|lodge|den)|cult lodge)\b/],
];

export function normalizePlan(p = {}) {
  const type = MAP_TYPES[p.type] ? p.type : "dungeon";
  const size = ["small", "medium", "large"].includes(p.size) ? p.size : "medium";
  const features = [...new Set((p.features || []).filter((f) => FEATURES[f]))];
  const clamp = (n, a, b) => (Number.isFinite(+n) && n !== null ? Math.max(a, Math.min(b, Math.round(+n))) : null);
  return {
    type, size, rooms: clamp(p.rooms, 1, 20), buildings: clamp(p.buildings, 1, 30), features, name: String(p.name || "").slice(0, 80),
    underground: !!p.underground, layout: p.layout === "strip" ? "strip" : null, landmark: p.landmark === "ziggurat" ? "ziggurat" : null,
    buildingKinds: (p.buildingKinds || []).filter((k) => BUILDING_KINDS.some(([n]) => n === k)),
  };
}

export function describePlan(p) {
  const bits = [(p.underground ? "Underground " : "") + MAP_TYPES[p.type].replace(/^./, (c) => (p.underground ? c.toLowerCase() : c)), `${p.size} size`];
  if (p.layout === "strip") bits.push("one long street");
  if (p.landmark) bits.push(`${p.landmark}${p.layout === "strip" ? " at the end" : " in the center"}`);
  if (p.type === "town") bits.push(p.buildingKinds.length ? `buildings: ${["houses", ...p.buildingKinds.map((k) => k.toLowerCase())].join(", ")}` : "houses");
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
  const r = rng(seed ^ 0x5bd1e995);
  const m = p.type === "town" ? buildTown(p, seed, r) : generateMap(p.type, seed, opts);
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
  if (has("altar") && !m.altarPlaced) { const [x, y] = center(); set(x, y, "t"); set(x + 1, y, "t"); label(x, y - 1, "Altar"); }
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

// ---------------------------------------------------------------
// towns built from the plan
// ---------------------------------------------------------------
const TOWN_DIMS = { strip: [[48, 22], [62, 26], [78, 30]], open: [[40, 30], [50, 36], [64, 46]] };

function buildTown(p, seed, r) {
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const strip = p.layout === "strip";
  const [W, H] = TOWN_DIMS[strip ? "strip" : "open"][["small", "medium", "large"].indexOf(p.size)];
  const ground = p.underground ? "c" : ",";
  const c = new Array(W * H).fill(p.underground ? " " : ",");
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? " " : c[y * W + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) c[y * W + x] = v; };
  const rect = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, v); };
  const labels = [], rooms = [];
  const ramshackle = p.features.includes("ramshackle");
  const stone = p.underground; // stone houses underground, timber above
  const zigSize = p.size === "small" ? 9 : p.size === "large" ? 13 : 11;

  // the house names: only kinds the description mentions, the rest plain houses
  const special = [...p.buildingKinds];
  const houseName = ramshackle ? "Hovel" : "House";

  const house = (x, y, w, h, doorSide) => {
    rect(x, y, w, h, "#");
    rect(x + 1, y + 1, w - 2, h - 2, stone ? "." : "b");
    const dx = x + 1 + ri(0, w - 3);
    const [doorX, doorY] = doorSide === "down" ? [dx, y + h - 1] : doorSide === "up" ? [dx, y] : doorSide === "left" ? [x, y + 1 + ri(0, h - 3)] : [x + w - 1, y + 1 + ri(0, h - 3)];
    set(doorX, doorY, "+");
    if (ramshackle) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
        const edge = i === x || j === y || i === x + w - 1 || j === y + h - 1;
        if (edge && get(i, j) === "#" && r() < 0.14) set(i, j, "^");
        else if (!edge && r() < 0.12) set(i, j, "^");
      }
    }
    const name = special.length && r() < 0.5 ? special.shift() : houseName;
    rooms.push({ x, y, w, h, name, n: rooms.length + 1 });
    labels.push({ x: x + 1, y: y + 1, text: name === houseName ? String(rooms.length) : name, public: name !== houseName });
  };

  let landmarkAt = null;
  if (strip) {
    // one long street, houses shoulder to shoulder on both sides, leading to the landmark
    const y0 = H >> 1;
    const endX = p.landmark ? W - zigSize - 4 : W - 3;
    if (p.underground) {
      // a long cavern around the street, with ragged walls
      let top = y0 - 9, bot = y0 + 9;
      for (let x = 1; x < W - 1; x++) {
        top = Math.max(1, Math.min(y0 - 7, top + ri(-1, 1))); bot = Math.min(H - 2, Math.max(y0 + 7, bot + ri(-1, 1)));
        const wide = x > endX - 2; // open up around the landmark
        for (let y = wide ? 1 : top; y <= (wide ? H - 2 : bot); y++) set(x, y, "c");
      }
      for (let k = 0; k < W; k++) { const x = ri(1, W - 2), y = ri(1, H - 2); if (get(x, y) === "c" && Math.abs(y - y0) > 6) set(x, y, r() < 0.5 ? "r" : "^"); }
    }
    rect(2, y0 - 1, endX - 1, 3, "=");
    // houses: walls back onto the street's edge, doors face it
    const wanted = p.buildings || Infinity;
    for (const side of [-1, 1]) {
      let x = 3;
      while (x < endX - 4 && rooms.length < wanted) {
        const w = ri(4, 6), h = ri(4, 5);
        if (x + w > endX - 1) break;
        const y = side < 0 ? y0 - 2 - h : y0 + 2;
        house(x, y, w, h, side < 0 ? "down" : "up");
        x += w + (r() < 0.6 ? 0 : 1); // shoulder to shoulder, the odd alley
      }
    }
    landmarkAt = p.landmark ? [W - 3 - (zigSize >> 1), y0] : null;
    if (landmarkAt) rect(endX - 1, y0 - 1, landmarkAt[0] - (zigSize >> 1) - endX + 1, 3, "=");
  } else {
    // crossroads village or underground warren around a central plaza
    if (p.underground) {
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
        if (d < 0.92 + (r() - 0.5) * 0.12) set(x, y, "c");
      }
    }
    const cx = W >> 1, cy = H >> 1;
    rect(3, cy - 1, W - 6, 2, "="); rect(cx - 1, 3, 2, H - 6, "=");
    const plaza = (p.landmark ? zigSize : 6) + 4;
    rect(cx - (plaza >> 1), cy - (plaza >> 1), plaza, plaza, ".");
    labels.push({ x: cx - (plaza >> 1), y: cy - (plaza >> 1), text: p.landmark ? "Plaza" : "Square", public: true });
    if (p.landmark) landmarkAt = [cx, cy];
    const wanted = p.buildings || 16;
    for (let tries = 0; tries < 600 && rooms.length < wanted; tries++) {
      const w = ri(4, 7), h = ri(4, 6), x = ri(2, W - w - 2), y = ri(2, H - h - 2);
      let ok = true;
      for (let j = y - 1; j <= y + h && ok; j++) for (let i = x - 1; i <= x + w && ok; i++) if (get(i, j) !== ground) ok = false;
      if (!ok) continue;
      const toRoad = [[0, y - 2, "up"], [0, y + h + 1, "down"], [x - 2, 0, "left"], [x + w + 1, 0, "right"]].find(([i, j, s]) =>
        s === "up" || s === "down" ? [...Array(w).keys()].some((k) => get(x + k, j) === "=" || get(x + k, j) === ".") : [...Array(h).keys()].some((k) => get(i, y + k) === "=" || get(i, y + k) === "."));
      if (!toRoad && r() < 0.8) continue;
      house(x, y, w, h, toRoad ? toRoad[2] : "down");
    }
  }
  // any named buildings not placed yet take over houses
  for (const rm of rooms) if (special.length && rm.name === houseName) { rm.name = special.shift(); const l = labels.find((l) => l.x === rm.x + 1 && l.y === rm.y + 1); if (l) { l.text = rm.name; l.public = true; } }

  let altarPlaced = false;
  if (landmarkAt) altarPlaced = ziggurat(landmarkAt[0], landmarkAt[1], zigSize, strip ? "left" : "down", p.features.includes("altar"));
  if (!p.underground) for (let k = 0; k < 20; k++) { const x = ri(0, W - 1), y = ri(0, H - 1); if (get(x, y) === ",") set(x, y, r() < 0.7 ? "T" : "f"); }

  return { w: W, h: H, cells: c.join(""), rooms, labels, theme: "town", seed, fog: "0".repeat(W * H), tokens: [], name: p.name || (p.underground ? "Underground town" : "Town"), altarPlaced };

  // a stepped pyramid: ledges ring each tier, one stair runs up the side facing the street
  function ziggurat(cx, cy, size, facing, withAltar) {
    const k = size >> 1;
    for (let y = cy - k - 1; y <= cy + k + 1; y++) for (let x = cx - k - 1; x <= cx + k + 1; x++) if (get(x, y) !== " ") set(x, y, ".");
    for (let y = cy - k; y <= cy + k; y++) for (let x = cx - k; x <= cx + k; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      const onStair = facing === "left" ? x < cx && Math.abs(y - cy) <= 1 : y > cy && Math.abs(x - cx) <= 1;
      if (d <= 1) set(x, y, ".");
      else if ((k - d) % 2 === 0) set(x, y, onStair ? "S" : "#");
      else set(x, y, onStair ? "S" : ".");
    }
    labels.push({ x: cx - k, y: cy - k - 1, text: "Ziggurat", public: true });
    if (withAltar) { set(cx, cy, "t"); labels.push({ x: cx - 1, y: cy - 1, text: "Altar", public: false }); return true; }
    return false;
  }
}
