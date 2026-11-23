// Distance and line of sight on the square grid (shared by the map view and the game engine).
export const pf2Distance = (dx, dy) => {
  const a = Math.abs(dx), b = Math.abs(dy);
  const d = Math.min(a, b), s = Math.max(a, b) - d;
  return 5 * (s + d + Math.floor(d / 2)); // every second diagonal costs 10 ft
};

const blocksSight = (ch) => ch === "#" || ch === " " || ch === "T" || ch === "p" || ch === "+" || ch === "r";

export function visibleFrom(map, ox, oy, radius) {
  const out = new Set();
  for (let y = oy - radius; y <= oy + radius; y++) for (let x = ox - radius; x <= ox + radius; x++) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    if (Math.hypot(x - ox, y - oy) > radius + 0.5) continue;
    // Bresenham line, stop at the first blocker (the blocker itself is visible)
    let x0 = ox, y0 = oy, ok = true;
    const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
    let err = dx + dy;
    while (!(x0 === x && y0 === y)) {
      if (!(x0 === ox && y0 === oy) && blocksSight(map.cells[y0 * map.w + x0])) { ok = false; break; }
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    if (ok) out.add(y * map.w + x);
  }
  return out;
}

export function roomCells(map, x, y) {
  // flood fill across non-blocking cells, not passing through doors, then include bordering walls
  const start = y * map.w + x;
  const passable = (i) => !blocksSight(map.cells[i]);
  const out = new Set();
  if (!passable(start)) return out;
  const stack = [start];
  out.add(start);
  while (stack.length && out.size < 2500) {
    const k = stack.pop();
    const kx = k % map.w, ky = Math.floor(k / map.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = kx + dx, ny = ky + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const nk = ny * map.w + nx;
      if (out.has(nk)) continue;
      out.add(nk);
      if (passable(nk)) stack.push(nk);
    }
  }
  return out;
}


// ---------------------------------------------------------------
// Movement: solid squares (walls, rock, trees, boulders, pillars, chasms)
// can't be entered, and a token can't pass through them to get somewhere.
// ---------------------------------------------------------------
export const SOLID = new Set([" ", "#", "T", "r", "p", "v", "?"]);

export function footprintClear(map, x, y, size = 1) {
  if (x < 0 || y < 0 || x + size > map.w || y + size > map.h) return false;
  for (let j = y; j < y + size; j++) for (let i = x; i < x + size; i++) if (SOLID.has(map.cells[j * map.w + i])) return false;
  return true;
}

// Is there a route from one position to another that never enters a solid
// square? Diagonal steps can't cut a solid corner.
export function canReach(map, from, to, size = 1) {
  if (!footprintClear(map, to.x, to.y, size)) return false;
  if (from.x === to.x && from.y === to.y) return true;
  const key = (x, y) => y * map.w + x;
  const seen = new Set([key(from.x, from.y)]);
  const queue = [[from.x, from.y]];
  // a start square that is already solid (a token parked in a wall) may still leave
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (seen.has(k) || !footprintClear(map, nx, ny, size)) continue;
      if (dx && dy && (!footprintClear(map, x + dx, y, size) || !footprintClear(map, x, y + dy, size))) continue;
      if (nx === to.x && ny === to.y) return true;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  return false;
}

// ---------------------------------------------------------------
// Lighting. A map's ambient light is bright, dim or dark. In the dark only
// light sources light squares: placed lights and tokens carrying a light.
// A light of radius r (in squares) gives bright light to r and dim light to 2r.
// ---------------------------------------------------------------
export const AMBIENT = { bright: "Bright light", dim: "Dim light", dark: "Darkness" };

export function lightLevels(map) {
  const n = map.w * map.h;
  const ambient = map.ambient || "bright";
  const level = new Uint8Array(n).fill(ambient === "bright" ? 2 : ambient === "dim" ? 1 : 0);
  if (ambient === "bright") return level;
  const sources = [...(map.lights || []), ...(map.tokens || []).filter((t) => t.light > 0).map((t) => ({ x: t.x + ((t.size || 1) >> 1), y: t.y + ((t.size || 1) >> 1), r: t.light }))];
  for (const s of sources) {
    const r = Math.max(1, s.r | 0);
    for (const i of visibleFrom(map, s.x, s.y, r * 2)) {
      const d = Math.hypot((i % map.w) - s.x, Math.floor(i / map.w) - s.y);
      level[i] = Math.max(level[i], d <= r + 0.5 ? 2 : 1);
    }
  }
  return level;
}

// What the party can see right now: squares in line of sight of a PC or ally
// token that are lit, or dark squares within reach of darkvision.
// visionOf(token) returns "darkvision", "greater darkvision", "low-light vision" or "normal".
export function partySight(map, visionOf = () => "normal", level = lightLevels(map)) {
  const seen = new Set();
  for (const t of map.tokens || []) {
    if (t.kind !== "pc" && t.kind !== "ally") continue;
    const v = String(visionOf(t) || "normal").toLowerCase();
    const dark = v.includes("darkvision");
    const ox = t.x + ((t.size || 1) >> 1), oy = t.y + ((t.size || 1) >> 1);
    for (const i of visibleFrom(map, ox, oy, 30)) if (dark || level[i] > 0) seen.add(i);
  }
  return seen;
}
