import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, applyAction } from "../public/js/shared/game.js";
import { canReach, footprintClear, lightLevels, partySight } from "../public/js/shared/vision.js";

// 9x5 room split by a wall with one door:
const CELLS = [
  "#########",
  "#...#...#",
  "#...+...#",
  "#...#...#",
  "#########",
].join("");
function setup() {
  const g = createGame("MOVE01", "Move");
  const { slot } = joinGame(g, { name: "Ann" });
  const dm = { role: "dm" }, p = { role: "player", slot };
  applyAction(g, p, "saveCharacter", { character: { name: "Vel", level: 1 } });
  applyAction(g, dm, "saveMap", { map: { name: "Room", w: 9, h: 5, cells: CELLS, fog: "1".repeat(45), tokens: [], labels: [] }, activate: true });
  const m = g.maps[0];
  applyAction(g, dm, "token", { op: "add", x: 1, y: 1, label: "V", kind: "pc", slot });
  return { g, m, dm, p, t: m.tokens[0] };
}

test("players can't enter solid squares or pass through walls", () => {
  const { g, m, p, dm, t } = setup();
  assert.throws(() => applyAction(g, p, "token", { op: "move", id: t.id, x: 4, y: 1 }), /solid/);
  // through the door is fine
  applyAction(g, p, "token", { op: "move", id: t.id, x: 6, y: 2 });
  assert.deepEqual([t.x, t.y], [6, 2]);
  // shut the doorway with a wall: now the far side can't be reached
  m.cells = m.cells.slice(0, 2 * 9 + 4) + "#" + m.cells.slice(2 * 9 + 5);
  assert.throws(() => applyAction(g, p, "token", { op: "move", id: t.id, x: 1, y: 1 }), /no way through/i);
  // the GM can still place it anywhere
  applyAction(g, dm, "token", { op: "move", id: t.id, x: 1, y: 1 });
  assert.deepEqual([t.x, t.y], [1, 1]);
});

test("big tokens need room for their whole footprint", () => {
  const m = { w: 9, h: 5, cells: CELLS };
  assert.ok(footprintClear(m, 1, 1, 2));
  assert.ok(!footprintClear(m, 3, 1, 2)); // overlaps the wall
  assert.ok(!canReach(m, { x: 1, y: 1 }, { x: 5, y: 1 }, 2)); // a 1-square door is too narrow for Large
  assert.ok(canReach(m, { x: 1, y: 1 }, { x: 5, y: 1 }, 1));
});

test("darkness: only light sources and darkvision let the party see", () => {
  const m = { w: 9, h: 5, cells: CELLS, ambient: "dark", lights: [], tokens: [{ x: 1, y: 2, kind: "pc", size: 1 }] };
  assert.equal(partySight(m, () => "normal").size, 0);
  assert.ok(partySight(m, () => "darkvision").size > 0);
  m.tokens[0].light = 2;
  const lit = lightLevels(m);
  assert.equal(lit[2 * 9 + 1], 2);
  assert.ok(partySight(m, () => "normal").has(2 * 9 + 2));
  assert.ok(!partySight(m, () => "normal").has(1 * 9 + 6)); // behind the wall
});
