// Pets, familiars and animal companions.
// Pet and familiar statistics follow Player Core: level = yours, AC and saves =
// yours (before circumstance/status bonuses), 5 HP per level, Speed 25 feet.
// A pet uses 3 + your level for Perception, Acrobatics and Stealth; a familiar
// uses your level + your spellcasting attribute modifier. Animal companions and
// other creatures keep a hand-entered stat block.
import { h, clear, cap, signed, field, select, modal, toast, richText } from "./ui.js";
import { load, coreData } from "./data.js";
import { computeCharacter, AON } from "./shared/rules.js";

export const PET_KINDS = { pet: "Pet", familiar: "Familiar", animal: "Animal companion", other: "Other companion" };
const PET_ABILITIES = ["Amphibious", "Burrower", "Climber", "Darkvision", "Echolocation", "Fast Movement", "Flier", "Manual Dexterity", "Scent", "Tough"];
const uid = () => Math.random().toString(36).slice(2, 9);
const aon = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener" }, "AoN ↗");

export function newPet(kind = "pet") {
  return { id: uid(), kind, name: "", species: "", abilities: [], extraAbilities: 0, notes: "",
    stats: kind === "animal" || kind === "other" ? { level: 1, hp: 10, ac: 15, perception: 4, fort: 4, ref: 4, will: 2, speed: "25 feet", attacks: "", skills: "" } : null };
}

// How many abilities a pet or familiar gets
export function abilitySlots(pet, char) {
  if (pet.kind === "pet") return 2 + (pet.extraAbilities || 0);
  if (pet.kind !== "familiar") return 0;
  let n = 2;
  if (char.class === "Witch") n += 2 + [6, 12, 18].filter((l) => (char.level || 1) >= l).length;
  return n + (pet.extraAbilities || 0);
}

// Full statistics for a pet, familiar, or hand-entered companion
export function petStats(pet, char, data = coreData()) {
  if (pet.kind === "animal" || pet.kind === "other") {
    const s = pet.stats || {};
    return { level: +s.level || 1, maxHp: +s.hp || 1, ac: +s.ac || 10, perception: +s.perception || 0, saves: { fortitude: +s.fort || 0, reflex: +s.ref || 0, will: +s.will || 0 },
      skills: s.skills || "", speed: s.speed || "", attacks: s.attacks || "", senses: "" };
  }
  const comp = computeCharacter(char, data);
  const lvl = char.level || 1;
  const has = (a) => (pet.abilities || []).includes(a);
  const keyMod = pet.kind === "familiar" ? lvl + (comp.mods[comp.spellAttr] ?? comp.mods.cha) : 3 + lvl;
  const speeds = [has("Amphibious") || pet.aquatic ? "swim 25 feet" : null, has("Climber") ? "climb 25 feet" : null, has("Flier") ? "fly 25 feet" : null, has("Burrower") ? "burrow 5 feet" : null].filter(Boolean);
  const land = pet.aquatic && !has("Amphibious") ? null : `${has("Fast Movement") ? 40 : 25} feet`;
  return {
    level: lvl, maxHp: 5 * lvl + (has("Tough") ? 2 * lvl : 0), ac: comp.ac,
    saves: { ...comp.saves }, perception: keyMod,
    skills: `Acrobatics ${signed(keyMod)}, Stealth ${signed(keyMod)}, other skills ${signed(lvl)}`,
    speed: [land, ...speeds].filter(Boolean).join(", ") || "25 feet",
    senses: ["low-light vision", has("Darkvision") ? "darkvision" : null, has("Scent") ? "imprecise scent 30 feet" : null, has("Echolocation") ? "echolocation 20 feet" : null].filter(Boolean).join(", "),
    attacks: "", minion: true,
  };
}

// ---------------- builder section ----------------
export function petsSection(c, { render, num }) {
  c.pets ||= [];
  const sec = h("section", { class: "bsec" }, h("h3", {}, `${num}. Pets & companions`),
    h("p", { class: "hint" }, "Pets (from the Pet feat) and familiars get their numbers from your character. Animal companions and other creatures take a stat block you fill in."));
  c.pets.forEach((pet, i) => sec.append(petEditor(c, pet, { render, remove: () => { c.pets.splice(i, 1); render(); } })));
  const kind = select(Object.entries(PET_KINDS).map(([value, label]) => ({ value, label })), "pet", () => {});
  sec.append(h("div", { class: "row" }, kind, h("button", { onclick: () => { c.pets.push(newPet(kind.value)); render(); } }, "+ Add")));
  return sec;
}

function petEditor(c, pet, { render, remove }) {
  const box = h("div", { class: "pet-edit" });
  const input = (key, label, attrs = {}) => field(label, h("input", { value: pet[key] ?? "", ...attrs, onchange: (e) => { pet[key] = e.target.value; render(); } }));
  box.append(h("div", { class: "row between" }, h("h4", {}, pet.name || `New ${PET_KINDS[pet.kind].toLowerCase()}`, h("span", { class: "tag" }, PET_KINDS[pet.kind])),
    h("button", { class: "icon", title: "Remove", onclick: remove }, "✕")));
  box.append(h("div", { class: "grid3" }, input("name", "Name"), input("species", pet.kind === "familiar" ? "Creature (e.g. raven)" : "Animal or creature"),
    pet.kind === "pet" ? field("Habitat", select([{ value: "", label: "Land (Speed 25 feet)" }, { value: "1", label: "Aquatic (swim 25 feet, no land Speed)" }], pet.aquatic ? "1" : "", (v) => { pet.aquatic = !!v; render(); })) : null));
  if (pet.kind === "pet" || pet.kind === "familiar") {
    const slots = abilitySlots(pet, c);
    const chosen = pet.abilities || [];
    const chips = h("div", { class: "chips" });
    const draw = (list) => {
      clear(chips);
      for (const a of list) {
        const on = chosen.includes(a.name);
        chips.append(h("button", { class: `chip ${on ? "on" : ""}`, title: a.desc ? a.desc.replace(/<[^>]+>/g, "") : "", disabled: !on && chosen.length >= slots ? "disabled" : null,
          onclick: () => { pet.abilities = on ? chosen.filter((x) => x !== a.name) : [...chosen, a.name]; render(); } }, a.name, a.master ? " (master)" : ""));
      }
    };
    if (pet.kind === "pet") draw(PET_ABILITIES.map((name) => ({ name })));
    else load("familiar-abilities").then((all) => draw(all.filter((a) => (a.rarity || "common") === "common" || chosen.includes(a.name))));
    box.append(h("div", { class: "boost-row" }, h("span", { class: "lbl" }, `${pet.kind === "pet" ? "Pet" : "Familiar"} abilities (${chosen.length} of ${slots})`), chips),
      h("div", { class: "row" }, h("small", { class: "muted" }, pet.kind === "familiar" ? "Familiars can change abilities each day. Feats that add abilities: raise the extra count." : "Must include any ability the animal naturally has."),
        h("label", { class: "row" }, "Extra", h("input", { type: "number", min: 0, max: 10, value: pet.extraAbilities || 0, style: { width: "4em" }, onchange: (e) => { pet.extraAbilities = Math.max(0, +e.target.value | 0); render(); } }))));
  } else {
    const st = (pet.stats ||= newPet("animal").stats);
    const sIn = (key, label, type = "number") => field(label, h("input", { type, value: st[key] ?? "", onchange: (e) => { st[key] = type === "number" ? +e.target.value : e.target.value; render(); } }));
    box.append(h("div", { class: "grid3" }, sIn("level", "Level"), sIn("hp", "Max HP"), sIn("ac", "AC"), sIn("perception", "Perception"), sIn("fort", "Fortitude"), sIn("ref", "Reflex"), sIn("will", "Will"), sIn("speed", "Speed", "text")),
      field("Attacks (one per line, e.g. Jaws +7, 1d8+2 piercing)", h("textarea", { rows: 2, value: st.attacks || "", onchange: (e) => { st.attacks = e.target.value; render(); } })),
      field("Skills", h("input", { value: st.skills || "", placeholder: "Athletics +7, Survival +5", onchange: (e) => { st.skills = e.target.value; render(); } })),
      pet.kind === "animal" ? h("p", { class: "hint" }, "Use the companion type's stat block from Player Core (Animal Companions) at its current stage: young, mature, nimble or savage. ", aon("Animal Companions")) : null);
  }
  box.append(field("Notes", h("textarea", { rows: 2, value: pet.notes || "", onchange: (e) => { pet.notes = e.target.value; render(); } })));
  box.append(petBlock(pet, c));
  return box;
}

// ---------------- stat block (sheet, builder preview, game tab) ----------------
export function petBlock(pet, char, { live = null, onHp = null, roll = null } = {}) {
  const st = petStats(pet, char);
  const hp = live?.hp ?? st.maxHp;
  const rb = (mod, label) => (roll ? h("button", { class: "small", onclick: () => roll(mod, label) }, `${label} ${signed(mod)}`) : h("span", {}, `${label} ${signed(mod)}`));
  const attacks = String(st.attacks || "").split("\n").map((x) => x.trim()).filter(Boolean);
  return h("div", { class: "statblock pet" },
    h("div", { class: "row between" }, h("h3", {}, pet.name || "Unnamed", pet.species ? h("small", { class: "muted" }, ` ${pet.species}`) : null), h("span", {}, `${PET_KINDS[pet.kind]} ${st.level}`)),
    st.minion ? h("div", { class: "traits" }, h("span", {}, "minion")) : null,
    h("div", { class: "row wrap" }, rb(st.perception, "Perception"), st.senses ? h("small", { class: "muted" }, st.senses) : null),
    st.skills ? h("p", {}, h("strong", {}, "Skills "), st.skills) : null,
    h("hr"),
    h("div", { class: "row wrap" }, h("strong", {}, `AC ${st.ac}`), rb(st.saves.fortitude, "Fort"), rb(st.saves.reflex, "Ref"), rb(st.saves.will, "Will")),
    h("div", { class: "row wrap" }, h("strong", {}, `HP ${hp}/${st.maxHp}`),
      onHp ? [h("button", { class: "small", onclick: () => onHp(Math.max(0, hp - 1)) }, "−1"), h("button", { class: "small", onclick: () => onHp(Math.min(st.maxHp, hp + 1)) }, "+1"),
        h("input", { type: "number", placeholder: "±HP", style: { width: "5em" }, onchange: (e) => { onHp(Math.max(0, Math.min(st.maxHp, hp + (+e.target.value || 0)))); e.target.value = ""; } }),
        h("button", { class: "small", onclick: () => onHp(st.maxHp) }, "Full")] : null),
    h("hr"),
    h("p", {}, h("strong", {}, "Speed "), st.speed),
    attacks.length ? h("div", {}, attacks.map((a) => {
      const m = /([+-]\d+)/.exec(a);
      return h("p", {}, h("strong", {}, "Strike "), a, roll && m ? h("button", { class: "small", onclick: () => roll(+m[1], a.split(/\s[+-]\d/)[0]) }, "Roll") : null);
    })) : null,
    (pet.abilities || []).length ? h("p", {}, h("strong", {}, "Abilities "), pet.abilities.join(", ")) : null,
    st.minion ? h("p", { class: "hint" }, "Minion: acts when you Command it (1 action for 2 of its actions). It can't make attacks except to Escape or Force Open (pets) and never gains item bonuses.") : null,
    pet.notes ? h("p", { class: "pre" }, pet.notes) : null);
}

// ---------------- game tab ----------------
export function petsTab(state, { myCharId, act }) {
  const box = h("div", { class: "pets" });
  const c = myCharId ? state.characters[myCharId] : null;
  if (!c) return h("div", { class: "empty" }, h("p", {}, "Save a character to see its pets here."));
  const pets = c.pets || [];
  if (!pets.length) return h("div", { class: "empty" }, h("h3", {}, "No pets or companions"), h("p", {}, "Add a pet, familiar or animal companion in the character builder (Character tab, then Edit), in the Pets & companions section."));
  const livePets = c.live?.pets || {};
  for (const pet of pets) {
    box.append(h("section", { class: "bsec" }, petBlock(pet, c, {
      live: livePets[pet.id],
      onHp: (hp) => act("updateCharacterState", { characterId: c.id, live: { pets: { ...livePets, [pet.id]: { ...(livePets[pet.id] || {}), hp } } } }).catch((e) => toast(e.message, "error")),
      roll: (mod, label) => act("roll", { formula: `1d20${mod >= 0 ? "+" : ""}${mod}`, label: `${pet.name || "Pet"}: ${label}`, as: pet.name || c.name }),
    })));
  }
  return box;
}
