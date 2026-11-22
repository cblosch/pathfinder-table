import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, applyAction, viewFor } from "../public/js/shared/game.js";
import { startingGold, equipmentValue } from "../public/js/shared/rules.js";

function setup(gmless = false) {
  const g = createGame("SHOP01", "Shops", { gmless });
  const { slot } = joinGame(g, { name: "Ana" });
  const p = { role: "player", slot };
  applyAction(g, p, "saveCharacter", { character: { name: "Vel", level: 3, equipment: { weapons: [], items: [], gold: 20, budget: 30 } } });
  return { g, p, dm: { role: "dm" }, cid: g.slots[slot].characterId };
}
const shop = { name: "Kettle", stock: [{ name: "Rope", level: 0, price: 0.5, type: "equipment" }, { name: "Healing Potion (Minor)", level: 1, price: 4, type: "consumable", qty: 2 }] };

test("starting gold follows GM Core lump sums", () => {
  assert.equal(startingGold(1), 15);
  assert.equal(startingGold(5), 270);
  assert.equal(startingGold(20), 112000);
});

test("equipment value counts items, weapons and runes", () => {
  const v = equipmentValue({ armor: "Leather", armorRunes: { potency: 1 }, weapons: [{ name: "Longsword", potency: 1 }], items: [{ name: "Rope", qty: 2, price: 0.5 }] },
    { armor: [{ name: "Leather", price: 2 }], weapons: [{ name: "Longsword", price: 1 }], shields: [], gear: [] });
  assert.equal(v, 2 + 160 + 1 + 35 + 1);
});

test("players only see open shops; buying spends coins and stock", () => {
  const { g, p, dm, cid } = setup();
  const id = applyAction(g, dm, "saveShop", { shop: { ...shop, open: false, gmNotes: "secret" } });
  assert.equal(viewFor(g, p).shops.length, 0);
  assert.throws(() => applyAction(g, p, "shopBuy", { shopId: id, item: "Rope" }), /isn't open/);
  applyAction(g, dm, "saveShop", { shop: { ...g.shops[0], open: true } });
  assert.equal(viewFor(g, p).shops[0].gmNotes, undefined);
  applyAction(g, p, "shopBuy", { shopId: id, item: "Healing Potion (Minor)", qty: 2 });
  const e = g.characters[cid].equipment;
  assert.equal(e.gold, 12);
  assert.equal(e.budget, 30);
  assert.equal(g.shops[0].stock[1].qty, 0);
  assert.throws(() => applyAction(g, p, "shopBuy", { shopId: id, item: "Healing Potion (Minor)" }), /Only 0 left/);
  applyAction(g, p, "shopSell", { shopId: id, item: "Healing Potion (Minor)", qty: 1 });
  assert.equal(e.gold, 14);
  assert.equal(e.budget, 28);
  assert.equal(e.items[0].qty, 1);
});

test("can't overspend; markup applies; GM gives gold; players can't run shops", () => {
  const { g, p, dm, cid } = setup();
  const id = applyAction(g, dm, "saveShop", { shop: { ...shop, open: true, markup: 50, stock: [{ name: "Lantern", level: 0, price: 10, type: "equipment" }] } });
  applyAction(g, p, "shopBuy", { shopId: id, item: "Lantern" });
  assert.equal(g.characters[cid].equipment.gold, 5);
  assert.throws(() => applyAction(g, p, "shopBuy", { shopId: id, item: "Lantern" }), /can't afford/);
  applyAction(g, dm, "giveGold", { characterId: cid, amount: 100 });
  assert.equal(g.characters[cid].equipment.gold, 105);
  assert.equal(g.characters[cid].equipment.budget, 130);
  assert.throws(() => applyAction(g, p, "giveGold", { characterId: cid, amount: 5 }), /Only the GM/);
  assert.throws(() => applyAction(g, p, "saveShop", { shop }), /Only the GM/);
});

test("without a GM, players can run shops", () => {
  const { g, p } = setup(true);
  const id = applyAction(g, p, "saveShop", { shop: { ...shop, open: false } });
  assert.equal(viewFor(g, p).shops.length, 1);
  applyAction(g, p, "deleteShop", { id });
  assert.equal(g.shops.length, 0);
});
