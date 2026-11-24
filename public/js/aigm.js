// The AI game master for tables without a human GM.
// A turn: the players' words go to chat, the AI narrates (posted as "Game
// Master"), and the commands in its reply change the table:
//   [MAP: description]      build a map from the description, show it, place the party
//   [ENCOUNTER: 3 goblin warrior, 1 goblin war chanter]   start a fight
//   [NOTE: text]            record it in the story log
// CHECK lines stay in the narration so players see what to roll.
import { load } from "./data.js";
import { planFromText, mapFromPlan } from "./mapdesc.js";

const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
let busy = false;
export const aiGMBusy = () => busy;

export async function aiGMTurn({ state, act, askAI, playerText = "", who = "A player", ask = null }) {
  if (busy) throw new Error("The game master is still answering.");
  busy = true;
  try {
    if (playerText) await act("chat", { text: playerText });
    const prompt = ask || (playerText ? `${who}: ${playerText}` : "Continue the scene: describe what the party now sees and what is happening.");
    const r = await askAI("gm", prompt);
    return await applyReply(r.text || "", { state, act });
  } finally {
    busy = false;
  }
}

export async function applyReply(text, { state, act }) {
  const commands = [];
  const narration = [];
  for (const raw of String(text).split("\n")) {
    const m = /^\s*\[\s*(MAP|ENCOUNTER|NOTE)\s*:\s*([\s\S]+?)\s*\]\s*$/i.exec(raw);
    if (m) commands.push([m[1].toUpperCase(), m[2]]);
    else narration.push(raw);
  }
  const say = narration.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (say) await act("chat", { text: say, as: "Game Master" });
  const done = [];
  for (const [kind, arg] of commands) {
    try {
      if (kind === "MAP") done.push(await buildMap(arg, { state, act }));
      if (kind === "ENCOUNTER") done.push(await startFight(arg, { state, act }));
      if (kind === "NOTE") { await act("addNote", { text: arg.slice(0, 500), tags: ["story"] }); done.push("note"); }
    } catch (e) {
      await act("chat", { text: `(The table couldn't carry out ${kind.toLowerCase()}: ${e.message})`, as: "Game Master" }).catch(() => {});
    }
  }
  return { narration: say, commands: done };
}

// A map from the GM's description, named after the plot location it matches
async function buildMap(description, { state, act }) {
  const locs = state.plot?.locations || [];
  const loc = locs.find((l) => l.name && description.toLowerCase().includes(l.name.toLowerCase()));
  const name = loc?.name || titleFrom(description);
  const m = mapFromPlan(planFromText(description, { fallbackType: loc?.type || "dungeon", name }));
  m.name = name;
  await act("saveMap", { map: m, activate: true });
  await act("placeParty").catch(() => {});
  return `map: ${name}`;
}
function titleFrom(d) {
  const m = /\b(?:a|an|the)\s+((?:[a-z'-]+\s+){0,3}?(?:crypt|tomb|cave|cavern|grotto|mine|forest|woods|clearing|glade|camp|village|town|city|street|square|market|tavern|inn|hall|temple|shrine|chapel|tower|keep|fortress|castle|ruins|sewer|vault|lair|den|bridge|road|desert|oasis|swamp|marsh|chamber|room|cellar|dungeon|library|throne room|ziggurat))\b/i.exec(d);
  const t = m ? m[1].replace(/\b(dim|dimly lit|dark|pitch[- ]black|bright|sunlit|gloomy|small|medium|large|huge|vast|tiny|medium-sized)\b\s*/gi, "").trim() : "";
  return t ? t.replace(/(^|\s)\w/g, (c) => c.toUpperCase()) : "New location";
}

// "3 goblin warrior, 1 goblin war chanter" → creatures from the bundled Monster Core data
async function startFight(spec, { state, act }) {
  const all = await load("creatures");
  const lvl = +state.plot?.partyLevel || Math.max(1, ...Object.values(state.characters || {}).map((c) => c.level || 1));
  const picked = [];
  for (const part of spec.split(/,|\band\b/)) {
    const m = /^\s*(\d+|a|an|one|two|three|four|five|six|seven|eight)?\s*(?:x\s*)?(.+?)\s*$/i.exec(part);
    if (!m || !m[2]) continue;
    const count = /^\d+$/.test(m[1] || "") ? +m[1] : NUM[(m[1] || "one").toLowerCase()] || 1;
    const want = m[2].toLowerCase().replace(/s$/, "");
    const cr = findCreature(all, want, lvl);
    if (cr) picked.push({ name: cr.name, level: cr.level, hp: cr.hp, ac: cr.ac, perception: cr.perception, size: cr.size, strikes: cr.strikes, count: Math.min(8, count) });
  }
  if (!picked.length) throw new Error(`no creatures matched “${spec}”`);
  await act("spawnEncounter", { creatures: picked });
  return `fight: ${picked.map((p) => `${p.count}× ${p.name}`).join(", ")}`;
}

export function findCreature(all, want, lvl) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const w = norm(want);
  const exact = all.find((c) => norm(c.name) === w || norm(c.name) === w + "s");
  if (exact) return exact;
  const words = w.split(/\s+/).filter((x) => x.length > 2);
  let best = null, score = -Infinity;
  for (const c of all) {
    const n = norm(c.name);
    const hits = words.filter((x) => n.includes(x) || (c.traits || []).includes(x)).length;
    if (!hits) continue;
    const s = hits * 10 - Math.abs((c.level ?? 0) - lvl) - ((c.rarity || "common") === "common" ? 0 : 3);
    if (s > score) { score = s; best = c; }
  }
  return best;
}
