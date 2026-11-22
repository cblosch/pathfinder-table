import { h, clear, cap, signed, field, select, modal, richText, toast, confirmDialog, groupedSelect, classGroups, ancestryGroups } from "./ui.js";
import { load, coreData } from "./data.js";
import {
  ATTRS, ATTR_NAMES, SKILLS, RANKS, AON, computeCharacter, validateCharacter, freeSkillCount,
  featSlotsFor, traditionFor, FULL_CASTERS, SPONTANEOUS, keyOptions, needsTraditionChoice, ESTIMATED_SLOTS, progressionFor,
  CUSTOM_HERITAGE, heritageName, heritageFeatTraits,
  CHARACTER_WEALTH, startingGold, RUNE_PRICES, RUNE_LEVELS, equipmentValue, fmtGp,
} from "./shared/rules.js";
import { autoBuild } from "./companions.js";

const shortSource = (s) => String(s || "").replace(/^Pathfinder (Lost Omens )?/, "");

// "Boosts: Int or Wis, free · Trained: Religion, Scribing Lore · Feat: Student of the Canon"
export function bgSummary(b) {
  if (!b) return "";
  const boosts = b.boosts.map((o) => (o.length >= 6 ? "free" : o.map((x) => x.toUpperCase()).join(" or "))).join(", ");
  const trained = [...b.skills.map(cap), ...(b.lore || [])].join(", ");
  return `Boosts: ${boosts} · Trained: ${trained || "none"}${b.feat ? ` · Feat: ${b.feat}` : ""}`;
}

export function blankCharacter(level = 1) {
  return {
    name: "", level, ancestry: "", heritage: "", background: "", class: "", subclass: "", keyAttribute: "",
    deity: "", boosts: { alternateAncestry: false, ancestry: [], background: [], free: [] },
    skills: { trained: [], increases: {}, lore: [] }, feats: {}, choices: {},
    spells: { cantrips: [], known: {}, slotOverrides: {} },
    equipment: { armor: "", armorRunes: { potency: 0, resilient: 0 }, shield: "", weapons: [], items: [], gold: 15, budget: null },
    languages: [], notes: "", color: "#3b6ea5",
  };
}

const aonLink = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener", title: "Open on Archives of Nethys" }, "AoN ↗");

// ------------------------------------------------------------------
// Builder: mount(container, character, {onSave, title})
// ------------------------------------------------------------------
export function mountBuilder(container, initial, { onSave, onCancel, title = "Character builder" } = {}) {
  const data = coreData();
  let c = structuredClone(initial || blankCharacter());
  // migrate older saves
  c.boosts ||= {}; c.skills ||= { trained: [], increases: {}, lore: [] }; c.feats ||= {}; c.choices ||= {};
  c.spells ||= { cantrips: [], known: {}, slotOverrides: {} }; c.equipment ||= blankCharacter().equipment;

  const root = h("div", { class: "builder" });
  const form = h("div", { class: "builder-form" });
  const side = h("aside", { class: "builder-summary" });
  root.append(h("div", { class: "builder-head" },
    h("h2", {}, title),
    h("div", { class: "row" },
      h("button", { onclick: () => randomize() }, "🎲 Random build"),
      onCancel ? h("button", { onclick: onCancel }, "Cancel") : null,
      h("button", { class: "primary", onclick: () => save() }, "Save character"))),
    h("div", { class: "builder-cols" }, form, side));
  container.append(root);

  const ancestry = () => data.ancestries.find((a) => a.name === c.ancestry);
  const background = () => data.backgrounds.find((b) => b.name === c.background);
  const klass = () => data.classes.find((x) => x.name === c.class);

  function set(path, value, rerender = true) {
    const keys = path.split(".");
    let o = c;
    for (const k of keys.slice(0, -1)) o = o[k] ||= {};
    o[keys.at(-1)] = value;
    rerender ? render() : summary();
  }

  async function randomize() {
    const lvl = c.level || 1;
    c = await autoBuild({ level: lvl, className: c.class || null, name: c.name || null });
    render();
    toast("Random build created. Adjust anything you like.");
  }

  async function save() {
    const issues = validateCharacter(c, data);
    if (issues.length && !(await confirmDialog(`This character still has ${issues.length} open choice${issues.length > 1 ? "s" : ""}:\n\n• ${issues.slice(0, 8).join("\n• ")}\n\nSave anyway? You can finish it later with Edit build.`, { ok: "Save anyway", cancel: "Keep editing" }))) return;
    onSave && onSave(structuredClone(c));
  }

  // ---------------- sections ----------------
  function basics() {
    const a = ancestry(), k = klass();
    const heritages = a ? [...a.heritages, ...data.versatileHeritages.map((v) => ({ ...v, versatile: true }))] : [];
    const sec = h("section", { class: "bsec" }, h("h3", {}, "1. Basics"));
    const name = h("input", { value: c.name, placeholder: "Character name", oninput: (e) => set("name", e.target.value, false) });
    sec.append(h("div", { class: "grid2" },
      field("Name", name),
      field("Level", select(Array.from({ length: 20 }, (_, i) => i + 1), c.level, (v) => set("level", +v))),
      field("Ancestry", groupedSelect(ancestryGroups(data.ancestries), c.ancestry, (v) => { c.heritage = ""; c.boosts.ancestry = []; set("ancestry", v); }, { first: { value: "", label: "Choose…" } })),
      field("Heritage", select([{ value: "", label: a ? "Choose…" : "pick an ancestry first" }, ...heritages.map((x) => ({ value: x.name, label: x.name + (x.versatile ? " (versatile)" : "") })), ...(a ? [{ value: CUSTOM_HERITAGE, label: "Custom heritage…" }] : [])], c.heritage, (v) => set("heritage", v))),
      field("Background", h("button", { class: `picker-btn ${c.background ? "" : "empty"}`, onclick: () => pickBackground() },
        c.background ? h("span", {}, h("strong", {}, c.background), h("small", { class: "muted" }, bgSummary(background()))) : "Choose a background…")),
      field("Class", groupedSelect(classGroups(data.classes), c.class, (v) => { c.subclass = ""; c.keyAttribute = ""; c.feats = Object.fromEntries(Object.entries(c.feats).filter(([key]) => !key.startsWith("class"))); c.spells = { cantrips: [], known: {}, slotOverrides: {} }; set("class", v); }, { first: { value: "", label: "Choose…" } })),
    ));
    if (c.heritage === CUSTOM_HERITAGE) {
      c.customHeritage ||= { ancestry: "", vision: false, name: "", desc: "" };
      const ch = c.customHeritage;
      const others = data.ancestries.filter((x) => x.name !== c.ancestry);
      const other = data.ancestries.find((x) => x.name === ch.ancestry);
      const vis = (v) => (v || "normal").replace(/-/g, " ");
      sec.append(h("div", { class: "custom-heritage" },
        h("h4", {}, "Custom heritage"),
        h("p", { class: "hint" }, "You're descended from a second ancestry. You can take its ancestry feats (as with Adopted Ancestry), and if your table agrees, gain its special vision."),
        h("div", { class: "grid2" },
          field("Second ancestry", groupedSelect(ancestryGroups(others), ch.ancestry, (v) => { ch.ancestry = v; render(); }, { first: { value: "", label: "Choose…" }, id: "ch-ancestry" })),
          field("Heritage name (optional)", h("input", { id: "ch-name", value: ch.name, placeholder: ch.ancestry ? `${ch.ancestry}-blooded` : "e.g. Dwarf-blooded", oninput: (e) => { ch.name = e.target.value; summary(); } }))),
        other ? h("label", { class: "check" }, h("input", { type: "checkbox", id: "ch-vision", checked: ch.vision, disabled: (other.vision || "normal") === "normal" ? "disabled" : null, onchange: (e) => { ch.vision = e.target.checked; render(); } }),
          (other.vision || "normal") === "normal" ? ` ${other.name} has no special vision to inherit` : ` Gain ${other.name} ${vis(other.vision)} (ask your GM)`) : null,
        field("Description (optional)", h("textarea", { id: "ch-desc", rows: 2, value: ch.desc, placeholder: "How the bloodline shows", oninput: (e) => { ch.desc = e.target.value; } }))));
    }
    if (k?.subclasses?.length) {
      sec.append(field(cap(k.subclassLabel), select([{ value: "", label: "Choose…" }, ...k.subclasses.map((s) => s.name)], c.subclass, (v) => set("subclass", v))));
    }

    if (k && needsTraditionChoice(c, k)) {
      sec.append(field("Spellcasting tradition", select([{ value: "", label: "Choose…" }, ...["arcane", "divine", "occult", "primal"].map((t) => ({ value: t, label: cap(t) }))], c.choices.tradition || "", (v) => set("choices.tradition", v)),
        `Your ${k.subclassLabel} lets you choose; check its text below.`));
    }
    if (c.class === "Cleric" || c.class === "Champion") {
      sec.append(deityPicker());
    }
    if (c.class === "Fighter") {
      const groups = [...new Set(data.weapons.map((w) => w.group).filter(Boolean))].sort();
      sec.append(field("Fighter Weapon Mastery group (level 5+)", select([{ value: "", label: "Choose…" }, ...groups.map((g) => ({ value: g, label: cap(g) }))], c.choices.fighterGroup, (v) => set("choices.fighterGroup", v))));
    }
    if (c.class === "Monk") {
      const saves = [{ value: "", label: "None" }, { value: "fortitude", label: "Fortitude" }, { value: "reflex", label: "Reflex" }, { value: "will", label: "Will" }];
      sec.append(h("div", { class: "grid3" },
        field("Path to Perfection (7)", select(saves, c.choices.path1, (v) => set("choices.path1", v))),
        field("Second Path (11)", select(saves, c.choices.path2, (v) => set("choices.path2", v))),
        field("Third Path (15)", select(saves, c.choices.path3, (v) => set("choices.path3", v)))));
    }
    // descriptions
    const info = h("div", { class: "info-cards" });
    if (a) info.append(infoCard(a.name, `${a.hp} HP · ${cap(a.size === "med" ? "medium" : a.size === "sm" ? "small" : a.size)} · ${a.speed} ft · ${cap(a.vision.replace(/-/g, " "))}`, a.desc));
    const her = heritages.find((x) => x.name === c.heritage);
    if (her) info.append(infoCard(her.name, "Heritage", her.desc));
    const bg = background();
    if (bg) info.append(infoCard(bg.name, `Trained: ${[...bg.skills.map(cap), ...bg.lore].join(", ")} · Feat: ${bg.feat || "none"}`, bg.desc));
    if (k) info.append(infoCard(k.name, `${k.hp} HP/level · Key: ${keyOptions(k).map((x) => ATTR_NAMES[x]).join(" or ")}${progressionFor(k)?.extracted ? " · proficiency increases read from the class text; check your saves and weapons against AoN" : ""}`, k.desc));
    const sub = k?.subclasses?.find((s) => s.name === c.subclass);
    if (sub) info.append(infoCard(sub.name, cap(k.subclassLabel), sub.desc));
    sec.append(info);
    return sec;
  }

  function deityPicker() {
    const wrap = h("div", { class: "grid2" });
    load("deities").then((deities) => {
      const sel = select([{ value: "", label: "Choose a deity…" }, ...deities.map((d) => ({ value: d.name, label: d.name }))], c.deity, (v) => {
        const d = deities.find((x) => x.name === v);
        c.deity = v;
        c.deitySkill = d?.skill?.[0] || "";
        render();
      });
      const d = deities.find((x) => x.name === c.deity);
      wrap.append(field("Deity", sel, d ? `Font: ${d.font.join("/")} · Skill: ${(d.skill || []).map(cap).join(", ")} · Favored weapon: ${(d.weapons || []).join(", ")} · Domains: ${(d.domains || []).join(", ")}` : "Your deity sets your divine skill and favored weapon."));
    });
    return wrap;
  }

  function infoCard(title, sub, desc) {
    const body = richText(desc);
    body.classList.add("collapsed");
    return h("div", { class: "info-card" },
      h("div", { class: "row between" }, h("strong", {}, title), aonLink(title)),
      h("small", { class: "muted" }, sub), body,
      h("button", { class: "link", onclick: (e) => { body.classList.toggle("collapsed"); e.target.textContent = body.classList.contains("collapsed") ? "more" : "less"; } }, "more"));
  }

  function pickBackground() {
    // Backgrounds whose restricted boost includes the class's key attribute come first
    const k = klass();
    const keys = k ? (keyOptions(k).length === 1 ? keyOptions(k) : c.keyAttribute ? [c.keyAttribute] : keyOptions(k)) : [];
    const fits = (bg) => keys.length > 0 && bg.boosts.some((o) => o.length < 6 && o.some((x) => keys.includes(x)));
    const sorted = [...data.backgrounds].sort((x, y) => (fits(y) - fits(x)) || x.name.localeCompare(y.name));
    openPicker(keys.length ? `Choose a background (best for ${k.name} listed first)` : "Choose a background", sorted, {
      meta: (b) => `${fits(b) ? `★ boosts ${keys.filter((x) => b.boosts.some((o) => o.length < 6 && o.includes(x))).map((x) => x.toUpperCase()).join("/")} · ` : ""}${bgSummary(b)}`,
      search: (b) => bgSummary(b),
      onPick: (b) => { c.boosts.background = []; set("background", b.name); },
    });
  }

  // A boost (or flaw) that isn't a choice, shown in the same row format as the choices
  function fixedRow(label, attr, flaw = false) {
    return h("div", { class: "boost-row" }, h("span", { class: "lbl" }, label),
      ...ATTRS.map((at) => h("button", { class: `chip ${at === attr ? (flaw ? "on flaw" : "on") : ""}`, disabled: "disabled", tabindex: -1 }, at.toUpperCase())));
  }

  function boostPicker(label, opts, current, onPick, taken = []) {
    // opts: array of attribute keys allowed
    return h("div", { class: "boost-row" }, h("span", { class: "lbl" }, label),
      ...ATTRS.map((at) => {
        const allowed = opts.includes(at);
        const on = current === at;
        return h("button", { class: `chip ${on ? "on" : ""}`, disabled: !allowed || (taken.includes(at) && !on) ? "disabled" : null, onclick: () => onPick(on ? "" : at) }, at.toUpperCase());
      }));
  }

  function attributes() {
    const a = ancestry(), bg = background(), k = klass();
    const sec = h("section", { class: "bsec" }, h("h3", {}, "2. Attribute boosts"),
      h("p", { class: "hint" }, "Each set of boosts must go to different attributes. Boosting an attribute that is already +4 or higher gives a partial boost; two partial boosts add +1."));
    const b = c.boosts;
    if (a) {
      sec.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: b.alternateAncestry, onchange: (e) => { b.alternateAncestry = e.target.checked; b.ancestry = []; render(); } }), " Alternate ancestry boosts (two free boosts, no flaw)"));
      if (b.alternateAncestry) {
        for (let i = 0; i < 2; i++) sec.append(boostPicker(`${a.name} free boost`, ATTRS, b.ancestry[i], (v) => { b.ancestry[i] = v; render(); }, b.ancestry.filter((_, j) => j !== i)));
      } else {
        a.boosts.forEach((opts, i) => {
          if (opts.length === 1) sec.append(fixedRow(`${a.name} boost`, opts[0]));
          else if (opts.length > 1) {
            const others = a.boosts.map((o, j) => (j === i ? null : o.length === 1 ? o[0] : b.ancestry[j])).filter(Boolean);
            sec.append(boostPicker(`${a.name} free boost`, opts, b.ancestry[i], (v) => { b.ancestry[i] = v; render(); }, others));
          }
        });
        a.flaws.filter((f) => f.length === 1).forEach((f) => sec.append(fixedRow(`${a.name} flaw (−1)`, f[0], true)));
      }
    }
    if (bg) {
      bg.boosts.forEach((opts, i) => {
        const others = bg.boosts.map((o, j) => (j === i ? null : o.length === 1 ? o[0] : b.background[j])).filter(Boolean);
        sec.append(boostPicker(`${bg.name} boost ${i + 1}${opts.length < 6 ? "" : " (free)"}`, opts, opts.length === 1 ? opts[0] : b.background[i], (v) => { b.background[i] = v; render(); }, others));
      });
    }
    if (k) {
      const opts = keyOptions(k);
      sec.append(opts.length === 1 ? fixedRow(`${k.name} key attribute`, opts[0]) : boostPicker(`${k.name} key attribute`, opts, c.keyAttribute, (v) => set("keyAttribute", v)));
    }
    const setPick = (key, label) => {
      b[key] ||= [];
      sec.append(h("div", { class: "boost-row" }, h("span", { class: "lbl" }, label),
        ...ATTRS.map((at) => {
          const on = b[key].includes(at);
          return h("button", { class: `chip ${on ? "on" : ""}`, disabled: !on && b[key].length >= 4 ? "disabled" : null,
            onclick: () => { b[key] = on ? b[key].filter((x) => x !== at) : [...b[key], at]; render(); } }, at.toUpperCase());
        })));
    };
    setPick("free", "Four free boosts");
    for (const lvl of [5, 10, 15, 20]) if (c.level >= lvl) setPick("l" + lvl, `Level ${lvl} boosts`);
    return sec;
  }

  function skills() {
    const k = klass(), bg = background();
    const sec = h("section", { class: "bsec" }, h("h3", {}, "3. Skills"));
    if (!k) return sec.append(h("p", { class: "hint" }, "Choose a class first.")), sec;
    const fixed = new Set([...(k.trainedSkills || []), ...(bg?.skills || []), ...(c.class === "Cleric" && c.deitySkill ? [c.deitySkill] : [])]);
    const want = freeSkillCount(c, data);
    c.skills.trained = c.skills.trained.filter((s) => !fixed.has(s));
    sec.append(h("div", { class: "boost-row" }, h("span", { class: "lbl" }, "Trained by class & background"),
      [...fixed].map((s) => h("button", { class: "chip on", disabled: "disabled", tabindex: -1 }, cap(s))),
      (bg?.lore || []).map((l) => h("button", { class: "chip on", disabled: "disabled", tabindex: -1 }, l)),
      !fixed.size && !bg?.lore?.length ? h("span", { class: "muted" }, "none") : null));
    sec.append(h("div", { class: "boost-row" }, h("span", { class: "lbl" }, `Choose ${want} (${c.skills.trained.length} of ${want})`),
      Object.keys(SKILLS).filter((s) => !fixed.has(s)).map((s) => {
        const on = c.skills.trained.includes(s);
        return h("button", { class: `chip ${on ? "on" : ""}`, disabled: !on && c.skills.trained.length >= want ? "disabled" : null,
          onclick: () => { c.skills.trained = on ? c.skills.trained.filter((x) => x !== s) : [...c.skills.trained, s]; render(); } }, cap(s));
      })));
    sec.append(h("p", { class: "hint" }, `Choices: ${k.additionalSkills} from your class + your Intelligence modifier${Object.values(c.feats || {}).includes("Natural Skill") ? " + 2 from Natural Skill" : ""}.`));
    const incLevels = k.skillIncreaseLevels.filter((l) => l <= c.level);
    if (incLevels.length) {
      sec.append(h("h4", {}, "Skill increases"), h("p", { class: "hint" }, "Expert from level 2, master from level 7, legendary from level 15. Each increase raises one skill by one rank."));
      const grid = h("div", { class: "grid3" });
      for (const lvl of incLevels) {
        grid.append(field(`Level ${lvl}`, select([{ value: "", label: "None" }, ...Object.keys(SKILLS).map((s) => ({ value: s, label: cap(s) }))], c.skills.increases[lvl], (v) => { c.skills.increases[lvl] = v; render(); })));
      }
      sec.append(grid);
    }
    if (c.heritage === "Skilled Human") {
      sec.append(field(`${heritageName(c)} skill (expert at 5th level)`, select([{ value: "", label: "Choose…" }, ...Object.keys(SKILLS).map((s) => ({ value: s, label: cap(s) }))], c.skills.heritage || "", (v) => set("skills.heritage", v))));
    }
    const lore = h("input", { value: (c.skills.lore || []).join(", "), placeholder: "e.g. Tavern Lore", onchange: (e) => set("skills.lore", e.target.value.split(",").map((x) => x.trim()).filter(Boolean)) });
    sec.append(field("Extra Lore skills (comma separated, e.g. from feats)", lore));
    return sec;
  }

  function feats() {
    const k = klass();
    const sec = h("section", { class: "bsec" }, h("h3", {}, "4. Feats"));
    if (!k) return sec.append(h("p", { class: "hint" }, "Choose a class first.")), sec;
    const bg = background();
    if (bg?.feat) sec.append(h("p", {}, "From background: ", h("strong", {}, bg.feat), " ", aonLink(bg.feat)));
    const list = h("div", { class: "feat-slots" });
    for (const slot of featSlotsFor(c, k)) {
      const chosen = c.feats[slot.key];
      list.append(h("div", { class: "feat-slot" },
        h("span", { class: "lvl" }, slot.level), h("span", { class: "kind" }, cap(slot.label)),
        h("button", { class: chosen ? "" : "empty", onclick: () => pickFeat(slot) }, chosen || "Choose…"),
        chosen ? aonLink(chosen) : null,
        chosen ? h("button", { class: "icon", title: "Clear", onclick: () => { delete c.feats[slot.key]; render(); } }, "✕") : null));
    }
    sec.append(list);
    return sec;
  }

  async function pickFeat(slot) {
    const all = await load("feats");
    const a = ancestry();
    const her = c.heritage ? data.versatileHeritages.find((v) => v.name === c.heritage) : null;
    const ancTraits = [a?.trait || a?.name.toLowerCase(), her?.name.toLowerCase().replace(/ /g, "-"), ...heritageFeatTraits(c, data)].filter(Boolean);
    const chosen = new Set(Object.values(c.feats));
    const eligible = all.filter((f) => {
      if (f.level > slot.level) return false;
      if (slot.kind === "ancestry") return f.category === "ancestry" && f.traits.some((t) => ancTraits.includes(t));
      if (slot.kind === "class") return f.category === "class" && f.traits.includes(c.class.toLowerCase());
      if (slot.kind === "skill") return f.category === "skill";
      if (slot.kind === "general") return f.category === "general" || f.category === "skill";
      return false;
    });
    const comp = computeCharacter(c, data);
    openPicker(`Choose a ${slot.label} feat (level ${slot.level} or lower)`, eligible, {
      meta: (f) => `Level ${f.level}${f.actions ? " · " + actionText(f.actions) : ""} · ${f.traits.join(", ")}`,
      warn: (f) => prereqWarning(f, comp, chosen),
      taken: (f) => chosen.has(f.name) && !f.desc.includes("multiple times"),
      onPick: (f) => { c.feats[slot.key] = f.name; render(); },
    });
  }

  function spells() {
    const k = klass();
    if (!k || !FULL_CASTERS.includes(k.name)) return null;
    const trad = traditionFor(c, klass());
    const comp = computeCharacter(c, data);
    const sec = h("section", { class: "bsec" }, h("h3", {}, `5. Spells (${cap(trad)})`),
      h("p", { class: "hint" }, SPONTANEOUS.includes(k.name)
        ? "Spontaneous caster: pick your repertoire. Default repertoire size equals your slots per rank."
        : "Prepared caster: pick what you prepare each day. You can change these between sessions."),
      ESTIMATED_SLOTS.includes(k.name)
        ? h("p", { class: "warn" }, `The ${k.name} slot table isn't in the bundled rules data, so these counts are an estimate (1st level is exact). Set them from the ${k.name} Spells per Day table on Archives of Nethys.`)
        : h("p", { class: "hint" }, "Slot counts are defaults for the class; adjust them if a feature changes them (check your class table on AoN)."));
    const row = (label, list, max, onAdd, onRemove, slotKey) => h("div", { class: "spell-rank" },
      h("div", { class: "row between" }, h("strong", {}, label),
        slotKey ? h("span", {}, "slots ", h("input", { type: "number", min: 0, max: 9, value: comp.slots[slotKey] ?? 0, style: { width: "3.5em" }, onchange: (e) => { c.spells.slotOverrides[slotKey] = +e.target.value; render(); } })) : h("span", {}, `${list.length}/${max}`)),
      h("div", { class: "chips" }, list.map((s) => h("span", { class: "chip on" }, s, " ", h("button", { class: "icon", onclick: () => onRemove(s) }, "✕"))),
        list.length < max ? h("button", { class: "chip add", onclick: onAdd }, "+ add") : null));
    sec.append(row("Cantrips", c.spells.cantrips, 5, () => pickSpell(0), (s) => { c.spells.cantrips = c.spells.cantrips.filter((x) => x !== s); render(); }));
    for (const [rank, n] of Object.entries(comp.slots)) {
      const known = c.spells.known[rank] || [];
      sec.append(row(`Rank ${rank}`, known, n, () => pickSpell(+rank), (s) => { c.spells.known[rank] = known.filter((x) => x !== s); render(); }, rank));
    }
    return sec;
  }

  async function pickSpell(rank) {
    const all = await load("spells");
    const trad = traditionFor(c, klass());
    const list = all.filter((s) => !s.focus && s.traditions.includes(trad) && (rank === 0 ? s.cantrip : !s.cantrip && s.rank <= rank));
    const have = new Set([...c.spells.cantrips, ...Object.values(c.spells.known).flat()]);
    openPicker(rank === 0 ? "Choose a cantrip" : `Choose a spell for rank ${rank}`, list, {
      meta: (s) => `${s.cantrip ? "Cantrip" : "Rank " + s.rank} · ${actionText(s.time)} · ${[s.range, s.area, s.target].filter(Boolean).join(" · ")}${s.save ? " · " + cap(s.save) : ""}`,
      taken: (s) => have.has(s.name) && rank === 0,
      onPick: (s) => {
        if (rank === 0) c.spells.cantrips.push(s.name);
        else (c.spells.known[rank] ||= []).push(s.name);
        render();
      },
    });
  }

  // Money: total wealth (budget) is the level's starting wealth unless edited;
  // coins = wealth − what the equipment is worth. Shop buys/sells in a game keep that true.
  let gearData = null;
  load("gear").then((g) => { gearData = g; if (c.equipment?.items?.length) render(); });
  const wealth = () => (c.equipment.budget ?? startingGold(c.level));
  const equipValue = () => equipmentValue(c.equipment, { ...data, gear: gearData || [] });
  const syncGold = () => { c.equipment.gold = Math.round((wealth() - equipValue()) * 100) / 100; return c.equipment.gold; };

  function equipment() {
    const comp = computeCharacter(c, data);
    const e = c.equipment;
    e.items ||= [];
    const coins = syncGold();
    const maxItemLevel = Math.max(1, (c.level || 1) - 1);
    const sec = h("section", { class: "bsec" }, h("h3", {}, `${FULL_CASTERS.includes(c.class) ? 6 : 5}. Equipment`));
    const profMark = (cat) => (comp.prof[cat] > 0 ? "" : " (untrained)");
    const gp = (n) => (n ? ` · ${fmtGp(n)}` : "");
    const afford = (price) => price <= coins + 1e-9;

    // purse
    const auto = e.budget == null;
    const budgetIn = h("input", { type: "number", min: 0, value: wealth(), style: { width: "8em" },
      onchange: (ev) => { const v = +ev.target.value; set("equipment.budget", Number.isFinite(v) && v >= 0 ? v : null); } });
    sec.append(h("div", { class: `purse ${coins < 0 ? "over" : ""}` },
      h("div", { class: "purse-row" },
        h("label", { class: "lbl" }, "Starting wealth"), budgetIn,
        auto ? h("small", { class: "muted" }, `level ${c.level} default`) : h("button", { class: "small", onclick: () => set("equipment.budget", null) }, `Reset to level ${c.level} default (${fmtGp(startingGold(c.level))})`)),
      h("div", { class: "purse-row" },
        h("span", { class: "lbl" }, "Spent on equipment"), h("span", {}, fmtGp(equipValue())),
        h("span", { class: "lbl" }, "Coins left"), h("strong", { class: coins < 0 ? "warn" : "" }, fmtGp(coins))),
      h("p", { class: "hint" }, c.level > 1
        ? `GM Core's lump-sum option for level ${c.level}: ${fmtGp(startingGold(c.level))}, spent on common items up to level ${maxItemLevel}. (The alternative is ${CHARACTER_WEALTH[Math.min(20, c.level)].items} permanent items plus ${fmtGp(CHARACTER_WEALTH[Math.min(20, c.level)].currency)}; enter a custom wealth if your GM uses it.)`
        : "A 1st-level character starts with 15 gp to spend."),
      coins < 0 ? h("p", { class: "warn" }, `Over budget by ${fmtGp(-coins)}. Remove something or raise the starting wealth.`) : null));

    // Armor that fits your stats: trained in it, its Dex cap uses your whole Dex
    // modifier, and you meet its Strength requirement. Best total AC first.
    const dex = comp.mods.dex, str = comp.mods.str;
    const armorAC = (a) => a.ac + Math.min(dex, a.dexCap ?? 99);
    const trained = (a) => comp.prof[a.category] > 0;
    const fits = (a) => trained(a) && (a.dexCap ?? 99) >= dex && str >= (a.strength || 0);
    const unarmoredAC = dex;
    function armorSelect() {
      const label = (a) => `${a.name}: ${cap(a.category)}, +${armorAC(a)} AC with your Dex${a.strength && str < a.strength ? `, needs Str +${a.strength}` : ""}${gp(a.price)}`;
      const byAC = (x, y) => armorAC(y) - armorAC(x) || x.price - y.price;
      const pool = data.armor.filter((a) => (a.rarity || "common") === "common" || a.name === e.armor);
      const best = pool.filter(fits).filter((a) => armorAC(a) >= unarmoredAC).sort(byAC);
      const groups = [
        { label: "Best fit for your stats", options: best.map((a) => ({ value: a.name, label: label(a) })) },
        { label: "Other armor you're trained in", options: pool.filter((a) => trained(a) && !best.includes(a)).sort(byAC).map((a) => ({ value: a.name, label: label(a) })) },
        { label: "Untrained (penalties)", options: pool.filter((a) => !trained(a)).sort(byAC).map((a) => ({ value: a.name, label: `${label(a)} (untrained)` })) },
      ];
      return groupedSelect(groups, e.armor, (v) => set("equipment.armor", v), { first: { value: "", label: `None (unarmored, +${unarmoredAC} AC from Dex)` } });
    }
    function armorHint() {
      const a = data.armor.find((x) => x.name === e.armor);
      if (!a) return `Dex ${dex >= 0 ? "+" : ""}${dex}, Str ${str >= 0 ? "+" : ""}${str}. Armor listed first uses your full Dex and needs no more Strength than you have.`;
      if (!trained(a)) return "You aren't trained in this armor, so you don't add proficiency to AC.";
      if ((a.dexCap ?? 99) < dex) return `Its Dex cap (+${a.dexCap}) wastes ${dex - a.dexCap} point${dex - a.dexCap > 1 ? "s" : ""} of your Dex.`;
      if (str < (a.strength || 0)) return `Below its Strength +${a.strength}, so its check penalty (${a.checkPenalty})${a.speedPenalty ? ` and full Speed penalty (${a.speedPenalty} ft)` : ""} apply.`;
      return "Fits your stats: full Dex bonus and no Strength penalty.";
    }

    const runeSel = (kind, labels, val, onPick) => select([0, 1, 2, 3].map((n) => ({ value: n, label: `${labels[n]}${gp(RUNE_PRICES[kind][n])}${n && RUNE_LEVELS[kind][n] > c.level ? ` (item ${RUNE_LEVELS[kind][n]})` : ""}` })), val, onPick);
    sec.append(h("div", { class: "grid3" },
      (() => { const f = field("Armor", armorSelect(), armorHint()); f.classList.add("span-all"); return f; })(),
      field("Armor potency", runeSel("armorPotency", ["none", "+1", "+2", "+3"], e.armorRunes.potency, (v) => set("equipment.armorRunes.potency", +v))),
      field("Resilient", runeSel("resilient", ["none", "resilient", "greater", "major"], e.armorRunes.resilient, (v) => set("equipment.armorRunes.resilient", +v))),
      field("Shield", select([{ value: "", label: "None" }, ...data.shields.map((s) => ({ value: s.name, label: `${s.name} (+${s.ac} AC raised, Hardness ${s.hardness})${gp(s.price)}` }))], e.shield, (v) => set("equipment.shield", v)))));
    const wlist = h("div", { class: "weapons" });
    e.weapons.forEach((w, i) => {
      const wd = data.weapons.find((x) => x.name === w.name);
      wlist.append(h("div", { class: "weapon-row" },
        h("strong", {}, w.name), h("small", { class: "muted" }, wd ? `${cap(wd.category)}${profMark(wd.category)} · ${wd.damage} ${wd.damageType} · ${wd.traits.join(", ")}${gp(wd.price)}` : ""),
        runeSel("weaponPotency", ["no potency", "+1", "+2", "+3"], w.potency || 0, (v) => { w.potency = +v; render(); }),
        runeSel("striking", ["no striking", "striking", "greater striking", "major striking"], w.striking || 0, (v) => { w.striking = +v; render(); }),
        h("button", { class: "icon", title: "Remove (refunds the price)", onclick: () => { e.weapons.splice(i, 1); render(); } }, "✕")));
    });
    sec.append(h("h4", {}, "Weapons"), wlist,
      h("button", { onclick: () => openPicker("Buy a weapon", data.weapons, {
        meta: (w) => `${cap(w.category)}${profMark(w.category)} · ${w.damage} ${w.damageType}${w.range ? " · range " + w.range + " ft" : ""} · ${fmtGp(w.price)}${afford(w.price) ? "" : " · can't afford"} · ${w.traits.join(", ")}`,
        onPick: (w) => { e.weapons.push({ name: w.name, potency: 0, striking: 0 }); render(); },
      }) }, "+ Buy weapon"));

    // gear, bought from the shop
    const ilist = h("div", { class: "gear-list" }, e.items.map((it, i) => {
      const price = it.price ?? gearData?.find((g) => g.name === it.name)?.price ?? 0;
      return h("div", { class: "gear-row" },
        h("span", {}, it.name), h("small", { class: "muted" }, price ? `${fmtGp(price)} each` : ""),
        h("span", { class: "qty" },
          h("button", { class: "icon", title: "One fewer", onclick: () => { if ((it.qty || 1) > 1) it.qty--; else e.items.splice(i, 1); render(); } }, "−"),
          h("span", {}, it.qty || 1),
          h("button", { class: "icon", title: "One more", disabled: afford(price) ? null : "disabled", onclick: () => { it.qty = (it.qty || 1) + 1; render(); } }, "+")));
    }));
    if (!e.items.length) ilist.append(h("p", { class: "muted" }, "Nothing yet."));
    sec.append(h("h4", {}, "Gear"), ilist,
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => openShop() }, "🛒 Shop for gear"),
        h("small", { class: "muted" }, `Common items up to level ${maxItemLevel}; prices are deducted from your coins.`)));
    return sec;

    async function openShop() {
      const gear = await load("gear");
      gearData = gear;
      const stock = gear.filter((g) => g.level <= maxItemLevel && g.price > 0 && !/^(Weapon Potency|Armor Potency|Striking|Resilient)\b/.test(g.name));
      const TYPES = [["all", "Everything"], ["equipment", "Adventuring gear"], ["consumable", "Consumables"], ["ammo", "Ammunition"], ["weapon (magic)", "Magic weapons"], ["armor (magic)", "Magic armor"], ["shield (magic)", "Magic shields"], ["container", "Containers"]];
      let type = "all";
      const q = h("input", { placeholder: "Search…" });
      const purse = h("strong", {});
      const list = h("div", { class: "picker-list" });
      const draw = () => {
        const have = syncGold();
        purse.textContent = fmtGp(have);
        clear(list);
        const term = q.value.toLowerCase().trim();
        const shown = stock.filter((g) => (type === "all" || g.type === type) && (g.rarity || "common") === "common" && (!term || g.name.toLowerCase().includes(term) || g.traits.some((t) => t.includes(term))));
        for (const g of shown.slice(0, 200)) {
          const desc = richText(g.desc || ""); desc.classList.add("collapsed");
          const ok = g.price <= have + 1e-9;
          list.append(h("div", { class: "pick" },
            h("div", { class: "row between" },
              h("button", { class: "link strong", onclick: () => desc.classList.toggle("collapsed") }, g.name),
              h("span", { class: "row" }, h("span", { class: ok ? "" : "warn" }, fmtGp(g.price)),
                h("button", { class: "primary small", disabled: ok ? null : "disabled", onclick: () => {
                  const have = e.items.find((x) => x.name === g.name);
                  if (have) have.qty = (have.qty || 1) + 1; else e.items.push({ name: g.name, qty: 1, price: g.price });
                  toast(`Bought ${g.name}`); draw(); render();
                } }, ok ? "Buy" : "Can't afford"))),
            h("small", { class: "muted" }, `Item ${g.level} · ${g.type} · bulk ${g.bulk || "none"}${g.traits.length ? " · " + g.traits.join(", ") : ""}`), desc));
        }
        if (!shown.length) list.append(h("p", { class: "muted" }, "Nothing matches."));
        if (shown.length > 200) list.append(h("p", { class: "muted" }, `${shown.length - 200} more. Refine your search.`));
      };
      q.addEventListener("input", draw);
      modal("Shop", h("div", {},
        h("div", { class: "row between" }, h("span", {}, "Coins: ", purse), h("small", { class: "muted" }, `Common items, level ${maxItemLevel} and below`)),
        h("div", { class: "row" }, q, select(TYPES.map(([value, label]) => ({ value, label })), type, (v) => { type = v; draw(); })), list), { wide: true });
      draw();
    }
  }

  function extras() {
    const sec = h("section", { class: "bsec" }, h("h3", {}, "Details"));
    sec.append(h("div", { class: "grid2" },
      field("Extra languages (comma separated)", h("input", { value: (c.languages || []).join(", "), onchange: (e) => set("languages", e.target.value.split(",").map((x) => x.trim()).filter(Boolean), false) }),
        ancestry() ? `Choose from: ${ancestry().extraLanguages.join(", ")} (count = Intelligence modifier)` : ""),
      field("Token color", h("input", { type: "color", value: c.color || "#3b6ea5", onchange: (e) => set("color", e.target.value, false) }))));
    sec.append(field("Notes, backstory, appearance", h("textarea", { rows: 4, value: c.notes || "", oninput: (e) => set("notes", e.target.value, false) })));
    return sec;
  }

  function summary() {
    clear(side);
    const comp = computeCharacter(c, data);
    const issues = validateCharacter(c, data);
    // phone: compact bar that expands into the full summary
    side.append(h("button", { class: "sum-bar", onclick: () => side.classList.toggle("open") },
      h("strong", {}, c.name || "Unnamed"),
      h("span", {}, `HP ${comp.maxHp} · AC ${comp.ac}`),
      h("span", { class: issues.length ? "warn" : "ok" }, issues.length ? `${issues.length} to do` : "✓ ready"),
      h("span", { class: "chev" }, "▴")));
    side.append(
      h("h3", { class: "sum-title" }, c.name || "Unnamed"),
      h("p", { class: "muted" }, [c.ancestry, c.class, c.level && `level ${c.level}`].filter(Boolean).join(" · ")),
      h("div", { class: "attr-grid" }, ATTRS.map((a) => h("div", { class: "attr" }, h("span", {}, a.toUpperCase()), h("strong", {}, signed(comp.mods[a]))))),
      h("table", { class: "mini" }, h("tbody", {},
        h("tr", {}, h("td", {}, "HP"), h("td", {}, comp.maxHp)),
        h("tr", {}, h("td", {}, "AC"), h("td", {}, comp.ac, comp.shieldAC ? ` (${comp.shieldAC} shield raised)` : "")),
        h("tr", {}, h("td", {}, "Fort / Ref / Will"), h("td", {}, `${signed(comp.saves.fortitude)} / ${signed(comp.saves.reflex)} / ${signed(comp.saves.will)}`)),
        h("tr", {}, h("td", {}, "Perception"), h("td", {}, signed(comp.perception))),
        h("tr", {}, h("td", {}, "Speed"), h("td", {}, `${comp.speed} ft`)),
        comp.classDC ? h("tr", {}, h("td", {}, "Class DC"), h("td", {}, comp.classDC)) : null,
        comp.spellDC ? h("tr", {}, h("td", {}, "Spell attack / DC"), h("td", {}, `${signed(comp.spellAttack)} / ${comp.spellDC}`)) : null)),
      h("h4", {}, "Skills"),
      h("div", { class: "skill-list" }, Object.keys(SKILLS).map((s) => h("div", { class: comp.skillRank[s] ? "" : "muted" }, h("span", {}, `${cap(s)} `, h("small", {}, RANKS[comp.skillRank[s]][0])), h("span", {}, signed(comp.skills[s]))))),
      h("h4", {}, "Strikes"),
      h("div", {}, comp.strikes.map((s) => h("div", { class: "row between" }, h("span", {}, s.name), h("span", {}, `${signed(s.attack)} · ${s.damage} ${s.damageType[0].toUpperCase()}`)))),
      issues.length ? h("div", { class: "issues" }, h("h4", {}, `Still to do (${issues.length})`), h("ul", {}, issues.map((i) => h("li", {}, i)))) : h("p", { class: "ok" }, "✓ All choices made"),
    );
  }

  function render() {
    // Keep every scroll position (the window and any scrolling panel around the
    // builder): rebuilding the form briefly shortens the page, which would snap them to the top.
    const scrollers = [];
    for (let el = form; el; el = el.parentElement) if (el.scrollTop) scrollers.push([el, el.scrollTop]);
    const wy = window.scrollY;
    const keepHeight = form.offsetHeight;
    form.style.minHeight = keepHeight + "px"; // hold the height while the content is swapped
    clear(form);
    form.append(basics(), attributes(), skills(), feats());
    const sp = spells();
    if (sp) form.append(sp);
    form.append(equipment(), extras());
    form.style.minHeight = "";
    for (const [el, y] of scrollers) el.scrollTop = y;
    if (window.scrollY !== wy) window.scrollTo(0, wy);
    summary();
  }
  render();
  return { get character() { return c; } };
}

// ------------------------------------------------------------------
// Generic searchable picker modal
// ------------------------------------------------------------------
export function openPicker(title, items, { meta, warn, taken, onPick, search }) {
  const q = h("input", { placeholder: "Search name, trait or text…", autofocus: true });
  let rarity = "common";
  const list = h("div", { class: "picker-list" });
  const draw = () => {
    clear(list);
    const term = q.value.toLowerCase().trim();
    const shown = items.filter((it) =>
      (rarity === "all" || (it.rarity || "common") === "common") &&
      (!term || it.name.toLowerCase().includes(term) || (it.traits || []).some((t) => t.includes(term)) || (search && search(it).toLowerCase().includes(term)) || (term.length > 3 && (it.desc || "").toLowerCase().includes(term))));
    if (!shown.length) list.append(h("p", { class: "muted" }, "Nothing matches."));
    for (const it of shown.slice(0, 250)) {
      const w = warn ? warn(it) : null;
      const isTaken = taken ? taken(it) : false;
      const desc = richText(it.desc || "");
      desc.classList.add("collapsed");
      list.append(h("div", { class: `pick ${isTaken ? "taken" : ""}` },
        h("div", { class: "row between" },
          h("button", { class: "link strong", onclick: () => { desc.classList.toggle("collapsed"); } }, it.name, it.rarity && it.rarity !== "common" ? h("span", { class: `rar ${it.rarity}` }, it.rarity) : null),
          h("span", { class: "row" }, aonLink(it.name), h("button", { class: "primary small", disabled: isTaken ? "disabled" : null, onclick: () => { onPick(it); m.close(); } }, isTaken ? "Taken" : "Choose"))),
        h("small", { class: "muted" }, meta ? meta(it) : ""),
        it.prereq?.length ? h("small", { class: w ? "warn" : "muted" }, `Prerequisites: ${it.prereq.join("; ")}${w ? "; " + w : ""}`) : null,
        desc));
    }
    if (shown.length > 250) list.append(h("p", { class: "muted" }, `${shown.length - 250} more. Refine your search.`));
  };
  q.addEventListener("input", draw);
  const rar = select([{ value: "common", label: "Common only" }, { value: "all", label: "Include uncommon/rare" }], rarity, (v) => { rarity = v; draw(); });
  const m = modal(title, h("div", {}, h("div", { class: "row" }, q, rar), list), { wide: true });
  draw();
  setTimeout(() => q.focus(), 30);
  return m;
}

export function actionText(a) {
  if (!a) return "";
  if (a === "reaction") return "⟲ reaction";
  if (a === "free") return "◇ free";
  if (/^\d$/.test(a)) return "◆".repeat(+a);
  if (/^1 to 3$/.test(a)) return "◆ to ◆◆◆";
  if (/^1 to 2$/.test(a)) return "◆ to ◆◆";
  if (/^2 to 3$/.test(a)) return "◆◆ to ◆◆◆";
  return a;
}

// Light prerequisite check: skill ranks, feats and attribute minimums.
function prereqWarning(f, comp, chosenFeats) {
  const problems = [];
  for (const p of f.prereq || []) {
    const t = (p || "").toLowerCase();
    const m = t.match(/^(trained|expert|master|legendary) in (\w+)/);
    if (m && m[2] in comp.skillRank) {
      const need = RANKS.map((r) => r.toLowerCase()).indexOf(m[1]);
      if (comp.skillRank[m[2]] < need) problems.push(`needs ${m[1]} ${m[2]}`);
      continue;
    }
    const am = t.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma) \+(\d)/);
    if (am) {
      const key = am[1].slice(0, 3);
      if ((comp.mods[key === "con" ? "con" : key] ?? 0) < +am[2]) problems.push(`needs ${am[1]} +${am[2]}`);
      continue;
    }
    if (!m && !am && /^[A-Z]/.test(p) && !/ /.test(p.trim().split(" ")[0] || "")) {
      // prerequisite that names a feat
      if (p.split(/,| or /).every((x) => !chosenFeats.has(x.trim()))) problems.push(`check: ${p}`);
    }
  }
  return problems.join("; ");
}
