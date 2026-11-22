// Shops: the GM generates a shop, opens it to the table, and players buy and
// sell with their character's coins. In a game without a GM every player can
// run the shops.
import { h, clear, cap, field, select, modal, toast, confirmDialog, richText } from "./ui.js";
import { load, coreData } from "./data.js";
import { act } from "./transport.js";
import { AON, fmtGp } from "./shared/rules.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const aon = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener" }, "AoN ↗");
const RUNE_RE = /^(Weapon Potency|Armor Potency|Striking|Resilient|Mythic)\b/;

export const SHOP_KINDS = {
  general: { label: "General store", names: ["The Laden Mule", "Copper Kettle Provisions", "Hearth & Haversack", "The Wayfarer's Rest Goods", "Odds and Ends"], keeper: "shopkeeper" },
  smith: { label: "Blacksmith & armorer", names: ["The Glowing Anvil", "Ironhand Forge", "Hammer and Tongs", "The Tempered Edge"], keeper: "smith" },
  alchemist: { label: "Alchemist", names: ["Bubbling Retort", "The Green Flask", "Quicksilver & Sons", "The Smoking Alembic"], keeper: "alchemist" },
  healer: { label: "Healer & temple", names: ["House of Mercy", "The Quiet Font", "Shrine of the Open Hand", "Willowbark Remedies"], keeper: "healer" },
  magic: { label: "Magic shop", names: ["The Gilded Sigil", "Curios of the Arcane", "The Ninth Lantern", "Starlit Emporium"], keeper: "enchanter" },
  fletcher: { label: "Fletcher & hunter", names: ["Feather & String", "The Straight Shaft", "Greenwood Outfitters"], keeper: "fletcher" },
};
const SIZES = { small: 8, medium: 16, large: 28 };
const KEEPERS = ["Mira", "Oskar", "Tamsin", "Hollis", "Brannoc", "Yeva", "Dunstan", "Ilse", "Corwin", "Sabeth", "Ferro", "Nim"];

// Build stock for a shop kind from the bundled item data.
async function buildStock(kind, level, size) {
  const [gear, core] = await Promise.all([load("gear"), Promise.resolve(coreData())]);
  const common = (x) => (x.rarity || "common") === "common" && x.price > 0;
  const lvlOk = (x) => x.level <= level;
  const has = (x, t) => (x.traits || []).includes(t);
  const asGear = (x, cat = "gear") => ({ name: x.name, level: x.level || 0, price: x.price, type: x.type || cat, cat, traits: x.traits || [] });
  let pools = [];
  const g = gear.filter((x) => common(x) && lvlOk(x) && !RUNE_RE.test(x.name));
  switch (kind) {
    case "smith":
      pools = [
        [core.weapons.filter((w) => common(w) && w.category !== "advanced" && !w.range).map((w) => asGear({ ...w, type: "weapon" }, "weapon")), 0.45],
        [core.armor.filter(common).map((a) => asGear({ ...a, type: "armor" }, "armor")), 0.3],
        [core.shields.filter(common).map((s) => asGear({ ...s, type: "shield" }, "shield")), 0.15],
        [g.filter((x) => x.type === "equipment" && /(repair|whetstone|smith|forge)/i.test(x.name)).map((x) => asGear(x)), 0.1],
      ];
      break;
    case "fletcher":
      pools = [
        [core.weapons.filter((w) => common(w) && w.range && w.category !== "advanced").map((w) => asGear({ ...w, type: "weapon" }, "weapon")), 0.4],
        [g.filter((x) => x.type === "ammo"), 0.4],
        [g.filter((x) => x.type === "equipment" && /(snare|trap|rope|climbing|survival|tent|bedroll)/i.test(x.name)), 0.2],
      ];
      break;
    case "alchemist":
      pools = [[g.filter((x) => x.type === "consumable" && has(x, "alchemical")), 0.85], [g.filter((x) => /alchemist's tools|alchemist's lab/i.test(x.name)), 0.15]];
      break;
    case "healer":
      pools = [
        [g.filter((x) => x.type === "consumable" && (has(x, "healing") || /(antidote|antiplague|elixir of life|healing potion|soothing tonic)/i.test(x.name))), 0.7],
        [g.filter((x) => /(healer's toolkit|religious symbol|religious text|holy water|bandage)/i.test(x.name)), 0.3],
      ];
      break;
    case "magic":
      pools = [
        [g.filter((x) => ["weapon (magic)", "armor (magic)", "shield (magic)"].includes(x.type) && x.level >= Math.max(1, level - 6)), 0.3],
        [g.filter((x) => x.type === "equipment" && has(x, "magical") && x.level >= Math.max(1, level - 6)), 0.3],
        [g.filter((x) => x.type === "consumable" && has(x, "magical") && x.level >= Math.max(1, level - 5)), 0.4],
      ];
      break;
    default: // general store
      pools = [
        [g.filter((x) => (x.type === "equipment" || x.type === "container") && x.level <= Math.min(level, 3) && !has(x, "magical")), 0.6],
        [g.filter((x) => x.type === "ammo" && x.level === 0), 0.1],
        [g.filter((x) => x.type === "consumable" && x.level <= Math.min(level, 3) && (has(x, "healing") || has(x, "alchemical"))), 0.3],
      ];
  }
  pools = pools.filter(([p]) => p.length);
  const n = SIZES[size] || SIZES.medium;
  const out = new Map();
  for (const [pool, share] of pools) {
    // favour items near the settlement's level so a big city doesn't sell only torches
    const sorted = shuffle(pool).sort((a, b) => (b.level >= level - 3) - (a.level >= level - 3));
    for (const it of sorted.slice(0, Math.max(1, Math.round(n * share)))) out.set(it.name, it);
  }
  return [...out.values()].map((it) => ({ ...it, qty: it.type === "consumable" || it.cat === "gear" && it.level > 0 ? 1 + Math.floor(Math.random() * 4) : null }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export async function generateShop({ kind = "general", level = 1, size = "medium" } = {}) {
  const k = SHOP_KINDS[kind] || SHOP_KINDS.general;
  return {
    name: pick(k.names), kind, keeper: `${pick(KEEPERS)}, the ${k.keeper}`, level, markup: 0, buys: true, open: false,
    blurb: "", gmNotes: "", stock: await buildStock(kind, level, size),
  };
}

// Draft shops survive the tab re-rendering when the game updates
let draft = null;

/**
 * The Shops tab.
 * gm: can generate, edit and open shops and hand out gold.
 * myCharId: the viewing player's character (players only).
 */
export function shopsPanel(state, { gm = false, myCharId = null } = {}) {
  const box = h("div", { class: "shops" });
  const shops = state.shops || [];
  const me = myCharId ? state.characters[myCharId] : null;
  const party = Object.values(state.characters || {});
  const run = (type, p, ok) => act(type, p).then(() => ok && toast(ok)).catch((e) => toast(e.message, "error"));

  if (gm) box.append(generatorSection(state));
  if (gm && party.length) box.append(purseSection(party, run));

  if (me) box.append(h("div", { class: "purse" }, h("div", { class: "purse-row" },
    h("span", { class: "lbl" }, `${me.name}'s coins`), h("strong", {}, fmtGp(me.equipment?.gold ?? 0)))));

  const visible = gm ? shops : shops.filter((s) => s.open);
  if (!visible.length) box.append(h("section", { class: "bsec" }, h("h3", {}, "Shops"), h("p", { class: "muted" }, gm ? "No shops yet. Generate one above." : "No shops are open right now. The GM opens them when you reach a market.")));
  for (const s of visible) box.append(shopCard(s, { gm, me, run }));
  return box;
}

function generatorSection(state) {
  const sec = h("section", { class: "bsec" }, h("h3", {}, "Shop generator"));
  const lvl = +state.plot?.partyLevel || Math.max(1, ...Object.values(state.characters || {}).map((c) => c.level || 1));
  const kind = select(Object.entries(SHOP_KINDS).map(([value, k]) => ({ value, label: k.label })), draft?.kind || "general", () => {});
  const level = h("input", { type: "number", min: 0, max: 20, value: draft?.level ?? lvl, style: { width: "5em" } });
  const size = select([{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }], "medium", () => {});
  const out = h("div", {});
  const showDraft = () => {
    clear(out);
    if (!draft) return;
    out.append(h("div", { class: "shop-draft" },
      h("div", { class: "grid2" },
        field("Name", h("input", { value: draft.name, oninput: (e) => (draft.name = e.target.value) })),
        field("Shopkeeper", h("input", { value: draft.keeper, oninput: (e) => (draft.keeper = e.target.value) }))),
      stockTable(draft.stock, { editable: true, onChange: showDraft }),
      h("div", { class: "row wrap" },
        h("button", { class: "primary", onclick: () => save(true) }, "Save & open to players"),
        h("button", { onclick: () => save(false) }, "Save closed"),
        h("button", { onclick: () => gen() }, "Reroll"),
        h("button", { onclick: () => { draft = null; showDraft(); } }, "Discard"))));
  };
  const gen = async () => { draft = await generateShop({ kind: kind.value, level: +level.value || 0, size: size.value }); showDraft(); };
  const save = (open) => act("saveShop", { shop: { ...draft, open } }).then(() => { toast(open ? `${draft.name} is open to players` : "Shop saved"); draft = null; }).catch((e) => toast(e.message, "error"));
  sec.append(h("p", { class: "hint" }, "Stocks common items up to the settlement level, using the bundled item data. Edit, reroll or add items before opening it."),
    h("div", { class: "row wrap end" }, field("Type", kind), field("Settlement level", level), field("Size", size), h("button", { class: "primary", onclick: gen }, "Generate shop")), out);
  showDraft();
  return sec;
}

function purseSection(party, run) {
  const sec = h("section", { class: "bsec" }, h("h3", {}, "Party coins"));
  sec.append(h("div", { class: "gear-list" }, party.map((c) => {
    const amt = h("input", { type: "number", step: "0.1", placeholder: "gp", style: { width: "6em" } });
    return h("div", { class: "gear-row" },
      h("strong", {}, c.name || "Unnamed"), h("span", {}, fmtGp(c.equipment?.gold ?? 0)),
      h("span", { class: "row" }, amt,
        h("button", { class: "small", onclick: () => +amt.value && run("giveGold", { characterId: c.id, amount: +amt.value }, `${c.name}: ${+amt.value > 0 ? "+" : ""}${+amt.value} gp`) }, "Give"),
        h("button", { class: "small", onclick: () => +amt.value && run("giveGold", { characterId: c.id, amount: -Math.abs(+amt.value) }, `${c.name}: −${Math.abs(+amt.value)} gp`) }, "Take")));
  })), h("p", { class: "hint" }, "Treasure and rewards: give gold here and it lands in that character's purse."));
  return sec;
}

const priceWithMarkup = (it, shop) => Math.round(it.price * (1 + (shop.markup || 0) / 100) * 100) / 100;

function stockTable(stock, { editable = false, onChange, shop = null, buy = null, coins = null } = {}) {
  const rows = stock.map((it, i) => {
    const each = shop ? priceWithMarkup(it, shop) : it.price;
    const soldOut = it.qty != null && it.qty <= 0;
    return h("tr", { class: soldOut ? "sold-out" : "" },
      h("td", {}, h("span", { class: "item-name" }, it.name), " ", aon(it.name)),
      h("td", { class: "muted" }, `${it.level}`),
      h("td", { class: "muted" }, cap(it.type)),
      h("td", { class: "num" }, editable ? h("input", { type: "number", min: 0, step: "0.1", value: it.price, style: { width: "6em" }, onchange: (e) => { it.price = Math.max(0, +e.target.value || 0); } }) : fmtGp(each)),
      h("td", { class: "num" }, editable
        ? h("input", { type: "number", min: 0, value: it.qty ?? "", placeholder: "∞", style: { width: "4em" }, onchange: (e) => { it.qty = e.target.value === "" ? null : Math.max(0, +e.target.value | 0); } })
        : it.qty == null ? "plenty" : soldOut ? "sold out" : it.qty),
      h("td", {}, editable
        ? h("button", { class: "icon", title: "Remove", onclick: () => { stock.splice(i, 1); onChange?.(); } }, "✕")
        : buy ? h("button", { class: "small primary", disabled: soldOut || (coins != null && each > coins + 1e-9) ? "disabled" : null, onclick: () => buy(it) }, coins != null && each > coins + 1e-9 ? "Too dear" : "Buy") : null));
  });
  const wrap = h("div", { class: "table-wrap" }, h("table", { class: "stock" },
    h("thead", {}, h("tr", {}, h("th", {}, "Item"), h("th", {}, "Lvl"), h("th", {}, "Type"), h("th", { class: "num" }, "Price"), h("th", { class: "num" }, "Stock"), h("th"))),
    h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colspan: 6, class: "muted" }, "Nothing in stock.")))));
  if (!editable) return wrap;
  return h("div", {}, wrap, h("button", { class: "small", onclick: () => addItemDialog(stock, onChange) }, "+ Add item"));
}

async function addItemDialog(stock, onChange) {
  const [gear, core] = [await load("gear"), coreData()];
  const all = [
    ...core.weapons.map((w) => ({ name: w.name, level: w.level || 0, price: w.price, type: "weapon", cat: "weapon", traits: w.traits, rarity: w.rarity })),
    ...core.armor.map((a) => ({ name: a.name, level: a.level || 0, price: a.price, type: "armor", cat: "armor", traits: a.traits, rarity: a.rarity })),
    ...core.shields.map((s) => ({ name: s.name, level: s.level || 0, price: s.price, type: "shield", cat: "shield", traits: s.traits, rarity: s.rarity })),
    ...gear.map((g) => ({ name: g.name, level: g.level, price: g.price, type: g.type, cat: "gear", traits: g.traits, rarity: g.rarity, desc: g.desc })),
  ];
  const q = h("input", { placeholder: "Search items…" });
  const list = h("div", { class: "picker-list" });
  const draw = () => {
    clear(list);
    const t = q.value.toLowerCase().trim();
    if (t.length < 2) return list.append(h("p", { class: "muted" }, "Type at least two letters."));
    for (const it of all.filter((x) => x.name.toLowerCase().includes(t)).slice(0, 60)) {
      list.append(h("div", { class: "pick row between" },
        h("span", {}, h("strong", {}, it.name), " ", h("small", { class: "muted" }, `item ${it.level} · ${it.type} · ${fmtGp(it.price)}${it.rarity && it.rarity !== "common" ? " · " + it.rarity : ""}`)),
        h("button", { class: "small primary", onclick: () => { const { desc, rarity, ...rest } = it; stock.push({ ...rest, qty: null }); onChange?.(); toast(`Added ${it.name}`); } }, "Add")));
    }
  };
  q.addEventListener("input", draw);
  modal("Add an item to the shop", h("div", {}, q, list), { wide: true });
  draw();
  setTimeout(() => q.focus(), 30);
}

function shopCard(s, { gm, me, run }) {
  const coins = me ? me.equipment?.gold ?? 0 : null;
  const card = h("section", { class: `bsec shop ${s.open ? "" : "closed"}` },
    h("div", { class: "row between" },
      h("h3", {}, s.name, s.open ? null : h("span", { class: "tag" }, "closed")),
      h("small", { class: "muted" }, [SHOP_KINDS[s.kind]?.label, s.keeper, `settlement level ${s.level}`].filter(Boolean).join(" · "))),
    s.blurb ? h("p", {}, s.blurb) : null,
    s.markup ? h("p", { class: "hint" }, s.markup > 0 ? `Prices are ${s.markup}% above list.` : `Prices are ${-s.markup}% below list.`) : null);
  if (gm) {
    const markup = h("input", { type: "number", value: s.markup || 0, step: 5, style: { width: "5em" } });
    card.append(h("div", { class: "row wrap" },
      h("button", { class: s.open ? "" : "primary", onclick: () => run("saveShop", { shop: { ...s, open: !s.open } }, s.open ? `${s.name} closed` : `${s.name} is open to players`) }, s.open ? "Close shop" : "Open to players"),
      h("label", { class: "row" }, "Markup %", markup, h("button", { class: "small", onclick: () => run("saveShop", { shop: { ...s, markup: +markup.value || 0 } }, "Prices updated") }, "Set")),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: s.buys !== false ? "checked" : null, onchange: (e) => run("saveShop", { shop: { ...s, buys: e.target.checked } }) }), "Buys from players"),
      h("button", { onclick: () => editShop(s, run) }, "Edit stock"),
      h("button", { class: "danger", onclick: async () => { if (await confirmDialog(`Delete ${s.name}?`, { ok: "Delete", danger: true })) run("deleteShop", { id: s.id }, "Shop deleted"); } }, "Delete")));
  }
  card.append(stockTable(s.stock, { shop: s, coins, buy: me && s.open ? (it) => run("shopBuy", { shopId: s.id, item: it.name, qty: 1, characterId: me.id }, `Bought ${it.name}`) : null }));
  if (me && s.open && s.buys !== false && me.equipment?.items?.length) card.append(sellBox(s, me, run));
  return card;
}

function sellBox(s, me, run) {
  const box = h("details", { class: "sell" }, h("summary", {}, `Sell to ${s.name} (half price)`));
  load("gear").then((gear) => {
    box.append(h("div", { class: "gear-list" }, me.equipment.items.map((it) => {
      const each = it.price ?? gear.find((g) => g.name === it.name)?.price ?? 0;
      return h("div", { class: "gear-row" },
        h("span", {}, `${(it.qty || 1) > 1 ? it.qty + "× " : ""}${it.name}`),
        h("small", { class: "muted" }, `offer ${fmtGp(each / 2)} each`),
        h("button", { class: "small", disabled: each > 0 ? null : "disabled", onclick: () => run("shopSell", { shopId: s.id, item: it.name, qty: 1, characterId: me.id, price: each }, `Sold ${it.name} for ${fmtGp(each / 2)}`) }, "Sell one"));
    })));
  });
  return box;
}

function editShop(s, run) {
  const copy = structuredClone(s);
  const body = h("div", {});
  const draw = () => {
    clear(body);
    body.append(
      h("div", { class: "grid2" },
        field("Name", h("input", { value: copy.name, oninput: (e) => (copy.name = e.target.value) })),
        field("Shopkeeper", h("input", { value: copy.keeper, oninput: (e) => (copy.keeper = e.target.value) }))),
      field("Description players see", h("textarea", { rows: 2, value: copy.blurb || "", oninput: (e) => (copy.blurb = e.target.value) })),
      field("GM notes (hidden from players)", h("textarea", { rows: 2, value: copy.gmNotes || "", oninput: (e) => (copy.gmNotes = e.target.value) })),
      stockTable(copy.stock, { editable: true, onChange: draw }),
      h("div", { class: "row end" }, h("button", { class: "primary", onclick: () => { run("saveShop", { shop: copy }, "Shop saved"); m.close(); } }, "Save")));
  };
  const m = modal(`Edit ${s.name}`, body, { wide: true });
  draw();
}
