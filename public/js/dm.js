import { h, clear, cap, tabs, toast, modal, field, select, copyText, debounce, isMobile, onLayoutChange, actionSheet, confirmDialog, promptDialog, formDialog, MODE, groupedSelect, classGroups, themeToggle } from "./ui.js";
import { planFromText, normalizePlan, mapFromPlan, describePlan } from "./mapdesc.js";
import { shopsPanel } from "./shops.js";
import { act, connect, session, askAI, config, shareInfo, exportGame, canPrint, isArtifact } from "./transport.js";
import { coreData, load } from "./data.js";
import { createMapView, generateMap, MAP_TYPES, visibleFrom, TERRAIN } from "./map.js";
import { plotEditor } from "./plot.js";
import { createLogPanel, createInitiativePanel } from "./table.js";
import { renderSheet } from "./sheet.js";
import { mountBuilder } from "./builder.js";
import { autoBuild, suggestTurn } from "./companions.js";
import { renderHandout, editHandout, suggestHandouts, printHandout, HANDOUT_KINDS } from "./handouts.js";
import { encounterBuilder, npcGenerator, lootGenerator, dcHelper, sceneBrief, creatureLoreHandout } from "./dmtools.js";
import { referencePanel, statBlock } from "./reference.js";
import { computeCharacter } from "./shared/rules.js";

export async function mountDM(app, { home } = {}) {
  let state = null;
  let aiOn = false;
  try { aiOn = (await config()).ai; } catch {}
  // The only AI feature: writing handout text
  const ai = aiOn ? (task, prompt) => askAI(task, prompt) : null;

  const header = h("header", { class: "topbar" });
  const main = h("main", { class: "main" });
  const side = h("aside", { class: "side" });
  app.append(header, h("div", { class: "layout" }, main, side));
  // Initiative + chat live in the sidebar on desktop and in the "Play" tab on phones.
  const iniPanel = createInitiativePanel({ isDM: true, onCompanionTurn: (c) => companionTurn(c), onShowCreature: (n) => showCreature(n) });
  const logPanel = createLogPanel({ isDM: true });
  const placePanels = () => { if (!isMobile()) side.append(iniPanel.el, logPanel.el); };
  placePanels();
  onLayoutChange(placePanels);
  let seenLog = 0;
  const unreadLog = () => (isMobile() && tabset?.current !== "play" && state ? Math.min(99, state.log.length - seenLog) : 0);
  const keepScroll = (fn) => { const y = window.scrollY, m = main.scrollTop, tb = main.querySelector(".tab-body"), t = tb?.scrollTop || 0; fn(); main.scrollTop = m; if (tb) tb.scrollTop = t; window.scrollTo(0, y); };

  // ---------------- persistent map view ----------------
  const savePaint = debounce((m) => act("saveMap", { map: m }).catch((e) => toast(e.message, "error")), 600);
  const mapView = createMapView({
    isDM: true,
    onTokenMove: (t, x, y) => act("token", { op: "move", id: t.id, x, y, mapId: state.activeMapId }).catch((e) => toast(e.message, "error")),
    onFog: (cells, reveal) => act("fog", { mapId: state.activeMapId, cells, reveal }).catch((e) => toast(e.message, "error")),
    onPaint: (m) => savePaint(m),
    onTokenAdd: (x, y) => tokenDialog(x, y),
    onLabelAdd: async (x, y) => {
      const r = await formDialog("Add label", [
        { name: "text", label: "Label text" },
        { name: "pub", label: "Players can see it once the area is revealed", type: "checkbox", value: false },
      ], { ok: "Add label" });
      if (!r || !r.text) return;
      const m = mapView.map;
      act("saveMap", { map: { ...m, labels: [...(m.labels || []), { x, y, text: r.text, public: r.pub }] } });
    },
  });
  const activeMap = () => state?.maps.find((m) => m.id === state.activeMapId) || null;

  function tokenDialog(x, y) {
    const label = h("input", { placeholder: "e.g. G1", maxlength: 6 });
    const kind = select(["enemy", "ally", "npc", "object"], "enemy", () => {});
    const color = h("input", { type: "color", value: "#a8322b" });
    const hidden = h("input", { type: "checkbox", checked: true });
    const size = select([{ value: 1, label: "Medium or smaller" }, { value: 2, label: "Large" }, { value: 3, label: "Huge" }, { value: 4, label: "Gargantuan" }], 1, () => {});
    const m = modal("Add token", h("div", {},
      h("div", { class: "grid2" }, field("Label", label), field("Kind", kind), field("Color", color), field("Size", size)),
      h("label", { class: "check" }, hidden, " Hidden from players until revealed"),
      h("button", { class: "primary", onclick: () => { act("token", { op: "add", x, y, label: label.value || "?", kind: kind.value, color: color.value, hidden: hidden.checked, size: +size.value }); m.close(); } }, "Add")));
    setTimeout(() => label.focus(), 20);
  }

  // ---------------- tab renderers ----------------
  function tableTab() {
    const m = activeMap();
    const wrap = h("div", { class: "table-tab" });
    const mapSel = select([{ value: "", label: state.maps.length ? "Choose a map…" : "No maps yet" }, ...state.maps.map((x) => ({ value: x.id, label: x.name }))], state.activeMapId || "", (v) => act("setActiveMap", { id: v || null }));
    wrap.append(h("div", { class: "row wrap scroll-row" },
      h("strong", { class: "hide-mobile" }, "Shown to players: "), mapSel,
      h("button", { class: "small", onclick: () => tabset.select("maps") }, "+ New map"),
      m ? [
        h("button", { class: "small", onclick: addPartyTokens }, "Place party tokens"),
        h("button", { class: "small", onclick: revealAroundParty }, "Reveal around party"),
        h("button", { class: "small", onclick: () => act("fog", { mapId: m.id, all: true }) }, "Reveal all"),
        h("button", { class: "small", onclick: async () => (await confirmDialog("Hide the whole map from players again?", { ok: "Hide all" })) && act("fog", { mapId: m.id, all: false }) }, "Hide all"),
        h("button", { class: "small", onclick: () => mapFragment(m) }, "Map-fragment handout"),
      ] : null));
    if (!m) {
      wrap.append(h("div", { class: "empty" }, h("p", {}, "No active map. Generate one from the Maps tab or from a location in your plot.")));
      return wrap;
    }
    mapView.setMap(m);
    wrap.append(mapView.el);
    tokenBox = h("div", {});
    drawTokenList(m);
    wrap.append(tokenBox);
    wrap.append(h("p", { class: "hint" }, "Tips: use ✋ Move to drag tokens, or tap a token then tap where it should go (distance shown in feet, PF2e diagonals). Drag empty space to pan; pinch or use − / + to zoom. ☀ Reveal / ☾ Hide paint fog; ▣ Reveal room opens a whole room at once. Players only receive revealed squares. Gold labels are GM-only."));
    return wrap;
  }

  let tokenBox = null;
  let tokensOpen = false;
  function drawTokenList(m) {
    if (!tokenBox) return;
    clear(tokenBox).append(h("details", { class: "tokens-list", open: tokensOpen || null, ontoggle: (e) => (tokensOpen = e.target.open) }, h("summary", {}, `Tokens (${m.tokens.length})`),
      h("ul", { class: "plain" }, m.tokens.map((t) => h("li", { class: "row wrap" },
        h("span", { class: "token-dot small", style: { background: t.color } }, t.label.slice(0, 2)),
        `${t.label} · ${t.kind} at ${t.x},${t.y}`, t.hidden ? h("span", { class: "tag" }, "hidden") : null,
        h("button", { class: "small", onclick: () => act("token", { op: "toggleHidden", id: t.id }) }, t.hidden ? "Reveal" : "Hide"),
        h("button", { class: "small", onclick: () => act("token", { op: "remove", id: t.id }) }, "Remove"))))));
  }

  async function addPartyTokens() {
    const m = activeMap();
    const start = [...m.cells].findIndex((c) => c === "S");
    const open = [];
    for (let i = 0; i < m.cells.length; i++) if (!TERRAIN[m.cells[i]]?.block && !m.tokens.some((t) => t.y * m.w + t.x === i)) open.push(i);
    const anchor = start >= 0 ? start : open[0];
    const ax = anchor % m.w, ay = Math.floor(anchor / m.w);
    open.sort((a, b) => Math.hypot((a % m.w) - ax, Math.floor(a / m.w) - ay) - Math.hypot((b % m.w) - ax, Math.floor(b / m.w) - ay));
    let k = 0;
    for (const s of state.slots) {
      if (!s.characterId || m.tokens.some((t) => t.slot === s.index)) continue;
      const c = state.characters[s.characterId];
      const i = open[k++];
      if (i === undefined || !c) break;
      await act("token", { op: "add", x: i % m.w, y: Math.floor(i / m.w), label: c.name.slice(0, 2), kind: s.type === "companion" ? "ally" : "pc", color: c.color || "#3b6ea5", slot: s.index, hidden: false });
    }
    await revealAroundParty();
  }

  async function revealAroundParty() {
    const m = activeMap();
    const cells = new Set();
    for (const t of m.tokens.filter((t) => t.kind === "pc" || t.kind === "ally")) for (const i of visibleFrom(m, t.x, t.y, 10)) cells.add(i);
    if (!cells.size) return toast("Place party tokens first.");
    await act("fog", { mapId: m.id, cells: [...cells], reveal: true });
  }

  async function mapFragment(m) {
    const r = await formDialog("Map fragment", [
      { name: "x", label: "Left column (x)", type: "number", value: 0, hint: "Hover or tap the map to see square coordinates." },
      { name: "y", label: "Top row (y)", type: "number", value: 0 },
      { name: "w", label: "Width in squares", type: "number", value: Math.min(16, m.w) },
      { name: "h", label: "Height in squares", type: "number", value: Math.min(12, m.h) },
    ], { ok: "Make handout" });
    if (!r || !r.w || !r.h) return;
    const { x, y, w, h: hh } = r;
    const image = mapView.snapshot(Math.max(0, x), Math.max(0, y), Math.min(w, m.w - x), Math.min(hh, m.h - y), 16);
    handoutDialog({ kind: "mapfrag", title: `Map of ${m.name}`, body: "", meta: { image } });
  }

  function mapsTab() {
    const box = h("div", {});
    let type = "dungeon", name = "", seed = "", w = "", hh = "";
    const preview = createMapView({ isDM: true });
    let current = null;
    const regen = () => {
      current = generateMap(type, seed ? +seed : undefined, { name: name || MAP_TYPES[type], w: w ? +w : undefined, h: hh ? +hh : undefined });
      preview.setMap(current);
      seedInput.value = current.seed;
    };
    const seedInput = h("input", { placeholder: "random", style: { width: "8em" }, onchange: (e) => (seed = e.target.value) });
    // ---- from a description ----
    const desc = h("textarea", { id: "map-desc", rows: 3, placeholder: "e.g. A flooded crypt with pillars, an altar and a collapsed stair down. Large." });
    const understood = h("p", { class: "hint" });
    let plan = null;
    const build = (p) => {
      plan = p;
      current = mapFromPlan(p);
      if (name) current.name = name;
      preview.setMap(current);
      seedInput.value = current.seed;
      clear(understood).append(h("strong", {}, "Understood as: "), describePlan(p));
    };
    box.append(h("section", { class: "bsec" }, h("h3", {}, "Describe a map"),
      h("p", { class: "hint" }, "Say what the place is and what's in it: the kind of place, its size, how many rooms or buildings, and features such as a river, lake, bridge, chasm, pillars, altar, statue, camp, ruins, rubble, stairs or furniture."),
      desc,
      h("div", { class: "row wrap" },
        h("button", { class: "primary", onclick: () => desc.value.trim() && build(planFromText(desc.value, { name })) }, "Build from description"),
        ai ? h("button", { onclick: async (e) => {
          if (!desc.value.trim()) return;
          e.target.disabled = true; e.target.textContent = "Reading…";
          try {
            const r = await ai("map", desc.value.trim());
            const m = r.text.match(/\{[\s\S]*\}/);
            build(normalizePlan({ ...JSON.parse(m ? m[0] : r.text), name }));
          } catch (err) { toast("The AI's reading couldn't be used; built from keywords instead.", "error"); build(planFromText(desc.value, { name })); }
          e.target.disabled = false; e.target.textContent = "✨ Read it with AI";
        } }, "✨ Read it with AI") : null,
        h("button", { onclick: () => plan && build(plan) }, "🎲 Another take")),
      understood));
    box.append(h("section", { class: "bsec" }, h("h3", {}, "Generate a map"),
      h("div", { class: "row wrap" },
        field("Type", select(Object.entries(MAP_TYPES).map(([value, label]) => ({ value, label })), type, (v) => { type = v; seed = ""; regen(); })),
        field("Name", h("input", { placeholder: "e.g. Drowned Chapel", oninput: (e) => { name = e.target.value; if (current) current.name = name; } })),
        field("Width", h("input", { type: "number", placeholder: "auto", style: { width: "5em" }, min: 16, max: 100, onchange: (e) => (w = e.target.value) })),
        field("Height", h("input", { type: "number", placeholder: "auto", style: { width: "5em" }, min: 12, max: 100, onchange: (e) => (hh = e.target.value) })),
        field("Seed", seedInput)),
      h("div", { class: "row" },
        h("button", { onclick: () => { seed = ""; regen(); } }, "🎲 Generate"),
        h("button", { class: "primary", onclick: async () => { if (!current) regen(); await act("saveMap", { map: { ...current, name: name || current.name }, activate: true }); toast("Map saved and shown to players (fully fogged)."); tabset.select("table"); } }, "Save & make active"),
        h("button", { onclick: async () => { if (!current) regen(); await act("saveMap", { map: { ...current, name: name || current.name } }); toast("Map saved"); } }, "Save for later")),
      preview.el));
    regen();
    box.append(h("section", { class: "bsec" }, h("h3", {}, "Saved maps"),
      state.maps.length ? h("ul", { class: "plain" }, state.maps.map((m) => h("li", { class: "row" },
        h("strong", {}, m.name), h("small", { class: "muted" }, `${m.w}×${m.h} ${m.theme}`),
        m.id === state.activeMapId ? h("span", { class: "tag" }, "active") : h("button", { class: "small", onclick: () => act("setActiveMap", { id: m.id }) }, "Show to players"),
        h("button", { class: "small", onclick: async () => { const n = await promptDialog("Rename map", m.name, "Name"); if (n) act("saveMap", { map: { ...m, name: n } }); } }, "Rename"),
        h("button", { class: "small", onclick: async () => (await confirmDialog(`Delete the map “${m.name}”?`, { ok: "Delete", danger: true })) && act("deleteMap", { id: m.id }) }, "Delete")))) : h("p", { class: "muted" }, "None yet.")));
    return box;
  }

  async function mapForLocation(loc) {
    // the location's description shapes the map (a "flooded chapel" gets water and an altar)
    const m = mapFromPlan(planFromText(`${loc.type || ""} ${loc.name || ""} ${loc.description || ""}`, { fallbackType: loc.type || "dungeon", name: loc.name }));
    const show = await confirmDialog(`Map for ${loc.name} created. Show it to players now? It starts fully hidden.`, { ok: "Show to players", cancel: "Just save it" });
    act("saveMap", { map: m, activate: show }).then(() => { toast("Map saved"); tabset.select("table"); });
  }

  function notesTab() {
    const text = h("textarea", { rows: 3, placeholder: "Something just happened? Jot it down. Notes feed the scene briefs. Tick 'share' to tell the players." });
    const share = h("input", { type: "checkbox" });
    const tags = h("input", { placeholder: "tags, comma separated", style: { width: "14em" } });
    const add = async () => {
      if (!text.value.trim()) return;
      await act("addNote", { text: text.value.trim(), public: share.checked, tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean) });
      text.value = ""; share.checked = false;
    };
    text.addEventListener("keydown", (e) => (e.key === "Enter" && (e.ctrlKey || e.metaKey)) && add());
    let filter = "";
    const list = h("div", { class: "notes" });
    const draw = () => {
      clear(list);
      for (const n of state.notes.slice().reverse().filter((n) => !filter || n.text.toLowerCase().includes(filter) || n.tags.includes(filter))) {
        list.append(h("div", { class: `note ${n.public ? "public" : ""}` },
          h("div", { class: "row between" }, h("small", { class: "muted" }, new Date(n.ts).toLocaleString(), " ", n.tags.map((t) => h("span", { class: "tag" }, t))),
            h("span", { class: "row" },
              h("button", { class: "small", onclick: () => act("updateNote", { id: n.id, public: !n.public }) }, n.public ? "Unshare" : "Share with players"),
              h("button", { class: "small", onclick: () => handoutDialog({ kind: "clue", title: "Note", body: n.text }) }, "→ handout"),
              h("button", { class: "icon", onclick: async () => (await confirmDialog("Delete this note?", { ok: "Delete", danger: true })) && act("deleteNote", { id: n.id }) }, "🗑"))),
          h("p", { class: "pre" }, n.text)));
      }
    };
    draw();
    return h("div", {},
      h("section", { class: "bsec" }, h("h3", {}, "Add information as it comes up"), text,
        h("div", { class: "row" }, tags, h("label", { class: "check" }, share, " Share with players"), h("button", { class: "primary", onclick: add }, "Add note (Ctrl+Enter)"))),
      h("div", { class: "row" }, h("input", { placeholder: "Filter notes…", oninput: (e) => { filter = e.target.value.toLowerCase(); draw(); } })),
      list);
  }

  function partyTab() {
    const box = h("div", { class: "party" });
    const share = shareInfo(state);
    box.append(h("section", { class: "bsec" },
      h("h3", {}, "Invite players"),
      isArtifact
        ? h("div", {},
          h("p", {}, "Join code ", h("strong", { class: "code big-code" }, state.code)),
          h("p", { class: "hint" }, "Share this page with each player from the artifact's Share menu (they need a claude.ai account and permission to edit, so their moves can be saved). They open it, tap “I'm a player” and enter the code. Keep this GM screen open while you play: it's what applies their moves."),
          h("button", { onclick: () => copyText(share.invite) }, "Copy invite message"))
        : [h("p", {}, "Players open this link (or go to the home page and enter code ", h("strong", { class: "code" }, state.code), "):"),
          h("div", { class: "row" }, h("input", { value: share.invite, readonly: true, style: { flex: 1 } }), h("button", { onclick: () => copyText(share.invite) }, "Copy"))]));
    const grid = h("div", { class: "seat-grid" });
    for (const s of state.slots) {
      const c = s.characterId ? state.characters[s.characterId] : null;
      const comp = c ? computeCharacter(c, coreData()) : null;
      const card = h("div", { class: `seat-card ${s.type}` },
        h("div", { class: "row between" }, h("strong", {}, `Seat ${s.index + 1}`), h("span", { class: "tag" }, s.type === "open" ? "open" : s.type === "companion" ? "companion" : s.playerName)),
        c ? h("div", {}, h("h4", {}, c.name), h("p", { class: "muted" }, `Level ${c.level} ${c.ancestry} ${c.class}`),
          h("p", {}, `HP ${c.live?.hp ?? comp.maxHp}/${comp.maxHp} · AC ${comp.ac} · Perception ${comp.perception >= 0 ? "+" : ""}${comp.perception}`),
          (c.live?.conditions || []).length ? h("p", { class: "warn" }, c.live.conditions.map((x) => x.name + (x.value ? " " + x.value : "")).join(", ")) : null)
          : s.type === "player" ? h("p", { class: "muted" }, "Building a character…") : null);
      const actions = h("div", { class: "row wrap" });
      if (c) actions.append(h("button", { class: "small", onclick: () => openSheet(c, s) }, "Sheet"));
      if (s.type === "companion") actions.append(
        h("button", { class: "small", onclick: () => editBuild(s, c) }, "Edit build"),
        h("button", { class: "small", onclick: () => companionTurn(c) }, "Suggest turn"));
      if (s.type === "player" && c) actions.append(h("button", { class: "small", onclick: () => editBuild(s, c) }, "Edit build"));
      if (s.type === "open") actions.append(h("button", { class: "small primary", onclick: () => fillDialog(s) }, "Fill with companion"));
      else actions.append(h("button", { class: "small", onclick: async () => (await confirmDialog(`Free seat ${s.index + 1}? Their character will be removed.`, { ok: s.type === "companion" ? "Remove" : "Kick", danger: true })) && act("kick", { slot: s.index }) }, s.type === "companion" ? "Remove" : "Kick"));
      card.append(actions);
      grid.append(card);
    }
    box.append(grid,
      state.slots.some((s) => s.type === "open") ? h("button", { onclick: async () => { for (const s of state.slots.filter((x) => x.type === "open")) await fillCompanion(s, null, ""); } }, "Fill all open seats with companions") : null);
    return box;
  }

  async function fillCompanion(s, className, personality) {
    const level = +state.plot.partyLevel || 1;
    const character = await autoBuild({ level, className: className || null });
    await act("fillCompanion", { slot: s.index, character, personality });
  }

  function fillDialog(s) {
    const classes = coreData().classes.map((c) => c.name);
    const taken = new Set(Object.values(state.characters).map((c) => c.class));
    const suggested = ["Cleric", "Fighter", "Rogue", "Wizard", "Bard", "Ranger", "Champion", "Druid"].find((c) => !taken.has(c)) || "";
    const cls = groupedSelect(classGroups(coreData().classes), suggested, () => {}, { first: { value: "", label: "Random" } });
    const pers = h("input", { placeholder: "e.g. cheerful, reckless, devout to Sarenrae" });
    const m = modal(`Fill seat ${s.index + 1} with a companion`, h("div", {},
      h("p", { class: "hint" }, `Builds a complete level ${state.plot.partyLevel || 1} character (set party level in the Plot tab). ${suggested ? `Suggested: ${suggested}, which the party doesn't have yet.` : ""} You run it, with turn suggestions from the initiative tracker${ai ? " and the AI assistant" : ""}.`),
      field("Class", cls), field("Personality", pers),
      h("button", { class: "primary", onclick: async () => { await fillCompanion(s, cls.value, pers.value); m.close(); toast("Companion created"); } }, "Create companion")));
  }

  function openSheet(c, s) {
    modal(c.name, renderSheet(c, { editable: true, rollAs: c.name }), { wide: true });
  }

  function editBuild(s, c) {
    const box = h("div", {});
    const m = modal(`Edit ${c.name}`, box, { wide: true });
    mountBuilder(box, c, {
      title: s.type === "companion" ? "Companion build" : "Player build (GM edit)",
      onSave: async (char) => { await act("saveCharacter", { slot: s.index, character: { ...char, companion: s.type === "companion", live: c.live } }); m.close(); },
      onCancel: () => m.close(),
    });
  }

  function companionTurn(c) {
    const { lines, comp } = suggestTurn(c, state, coreData());
    const roll = (mod, label) => act("roll", { formula: `1d20${mod >= 0 ? "+" : ""}${mod}`, label: `${c.name}: ${label}`, as: c.name });
    modal(`${c.name}'s turn`, h("div", {},
      h("ul", {}, lines.map((l) => h("li", {}, l))),
      h("div", { class: "row wrap" }, comp.strikes.slice(0, 3).map((s) => [
        h("button", { class: "small", onclick: () => roll(s.attack, `${s.name} Strike`) }, `${s.name} ${s.attack >= 0 ? "+" : ""}${s.attack}`),
        h("button", { class: "small", onclick: () => act("roll", { formula: s.damage, label: `${c.name}: ${s.name} damage`, as: c.name }) }, s.damage)])),

      h("details", {}, h("summary", {}, "Full sheet"), renderSheet(c, { editable: true, rollAs: c.name, compact: true }))), { wide: true });
  }

  function handoutsTab() {
    const box = h("div", {});
    box.append(h("div", { class: "row wrap" },
      h("button", { class: "primary", onclick: () => handoutDialog() }, "+ New handout"),
      h("button", { onclick: () => suggestDialog() }, "Suggest from plot"),
      h("button", { onclick: async () => {
        const gear = await load("gear");
        const { openPicker } = await import("./builder.js");
        const { itemHandout } = await import("./handouts.js");
        openPicker("Item card", gear, { meta: (g) => `Item ${g.level} · ${g.type} · ${g.price} gp`, onPick: (g) => handoutDialog(itemHandout(g)) });
      } }, "Item card"),
      h("button", { onclick: async () => {
        const cr = await load("creatures");
        const { openPicker } = await import("./builder.js");
        openPicker("Creature lore card (Recall Knowledge)", cr, { meta: (c) => `Creature ${c.level} · ${c.traits.join(", ")}`, onPick: (c) => handoutDialog(creatureLoreHandout(c)) });
      } }, "Creature lore card")));
    const list = h("div", { class: "handout-grid" });
    for (const ho of state.handouts.slice().reverse()) {
      const who = ho.to === "all" ? "Everyone" : ho.to.length ? ho.to.map((i) => state.characters[state.slots[i]?.characterId]?.name || `Seat ${i + 1}`).join(", ") : "Draft (not given)";
      list.append(h("div", { class: "handout-card" },
        h("div", { class: "row between" }, h("strong", {}, ho.title || HANDOUT_KINDS[ho.kind]), h("small", { class: "muted" }, who)),
        h("div", { class: "mini-preview" }, renderHandout(ho)),
        h("div", { class: "row" },
          h("button", { class: "small", onclick: () => handoutDialog(ho) }, "Edit / give"),
          canPrint ? h("button", { class: "small", onclick: () => printHandout(ho) }, "Print") : null,
          h("button", { class: "small", onclick: async () => (await confirmDialog("Delete this handout?", { ok: "Delete", danger: true })) && act("handout", { op: "delete", id: ho.id }) }, "Delete"))));
    }
    if (!state.handouts.length) list.append(h("p", { class: "muted" }, "No handouts yet. Try “Suggest from plot”."));
    box.append(list);
    return box;
  }

  function handoutDialog(initial) {
    editHandout(initial, state, { askAI: ai, onSend: (ho) => act("handout", ho).then(() => toast(ho.to === "all" || ho.to?.length ? "Handout given" : "Draft saved")).catch((e) => toast(e.message, "error")) });
  }

  function suggestDialog() {
    const ideas = suggestHandouts(state);
    if (!ideas.length) return toast("Add NPCs, locations or clues to your plot first.");
    const m = modal("Handouts suggested from your plot", h("div", { class: "handout-grid" }, ideas.map((ho) => h("div", { class: "handout-card" },
      h("div", { class: "mini-preview" }, renderHandout(ho)),
      h("button", { class: "small primary", onclick: () => { m.close(); handoutDialog(ho); } }, "Use this")))), { wide: true });
  }

  function toolsTab() {
    const box = h("div", { class: "tools" });
    const locs = state.plot.locations || [];
    box.append(
      h("section", { class: "bsec" }, h("h3", {}, "Scene briefs"),
        locs.length ? h("div", { class: "row wrap" }, locs.map((l) => h("button", { onclick: () => openBrief(l) }, l.name))) : h("p", { class: "muted" }, "Add locations in the Plot tab to get briefs that pull together NPCs, clues, DCs and maps.")),
      h("section", { class: "bsec" }, h("h3", {}, "DC helper"), dcHelper(state)),
      h("section", { class: "bsec" }, h("h3", {}, "NPC generator"), npcGenerator(state, {
        onAddToPlot: async (npc) => { const plot = structuredClone(state.plot); plot.npcs = [...(plot.npcs || []), { id: Math.random().toString(36).slice(2, 9), ...npc }]; await act("setPlot", { plot }); toast(`${npc.name} added to the plot`); },
      })),
      h("section", { class: "bsec" }, h("h3", {}, "Treasure"), lootGenerator(state, { onHandout: (ho) => handoutDialog(ho) })));
    return box;
  }

  function openBrief(loc) {
    modal(`Scene: ${loc.name}`, sceneBrief(state, loc, { onMap: (l) => mapForLocation(l), onHandout: (ho) => handoutDialog(ho) }), { wide: true });
  }

  const showCreature = async (name) => {
    const all = await load("creatures");
    const c = all.find((x) => x.name === name);
    if (c) modal(c.name, h("div", {}, statBlock(c), h("button", { onclick: () => handoutDialog(creatureLoreHandout(c)) }, "Make lore handout")), { wide: true });
  };

  // ---------------- tabs ----------------
  const LIVE = new Set(["table", "notes", "party", "handouts", "maps", "shops"]);
  let tabset;
  const makeTabs = () => tabs([
    { id: "table", group: "campaign", label: "Table", icon: "🗺️", short: "Map", primary: true, render: tableTab },
    { id: "play", group: "campaign", label: "Initiative & chat", icon: "💬", short: "Play", primary: true, mobileOnly: true, badge: unreadLog, render: playTab },
    { id: "party", group: "campaign", label: "Seats & party", icon: "👥", short: "Party", primary: true, render: partyTab },
    { id: "notes", group: "campaign", label: "Notes", icon: "📝", primary: true, render: notesTab },
    { id: "plot", group: "campaign", label: "Plot", icon: "📖", render: () => plotEditor(state, { onSceneBrief: openBrief, onMapFor: mapForLocation, onReload: () => setTimeout(() => tabset.refresh(), 400) }) },
    { id: "maps", group: "campaign", label: "Maps", icon: "🧭", render: mapsTab },
    { id: "handouts", group: "campaign", label: "Handouts", icon: "📜", render: handoutsTab },
    { id: "encounters", group: "campaign", label: "Encounters", icon: "⚔️", short: "Fights", render: () => encounterBuilder(state, { getActiveMap: activeMap }) },
    { id: "shops", group: "campaign", label: "Shops", icon: "🏪", render: () => shopsPanel(state, { gm: true }) },
    { id: "tools", group: "campaign", label: "GM tools", icon: "🧰", render: toolsTab },
    { id: "reference", group: "reference", label: "Rules", icon: "📚", render: () => referencePanel({ isDM: true }) },
  ], { hoist: () => main.parentElement, persistKey: `pftable.dmtab.${session.code}`, onChange: (id) => { if (id === "play") { seenLog = state.log.length; logPanel.scrollDown(); tabset.updateBar(); } } });

  function playTab() {
    seenLog = state.log.length;
    logPanel.scrollDown();
    return h("div", { class: "play-tab" }, iniPanel.el, logPanel.el);
  }

  let firstState = true;
  let mapsSig = "";
  connect((s) => {
    state = s;
    drawHeader();
    iniPanel.update(state);
    logPanel.update(state);
    if (firstState) { seenLog = state.log.length; tabset = makeTabs(); main.append(tabset.el); firstState = false; mapsSig = state.maps.map((m) => m.id + m.name).join() + state.activeMapId; return; }
    const cur = tabset.current;
    if (cur === "play") seenLog = state.log.length;
    tabset.updateBar();
    // The maps tab holds an unsaved preview; only redraw it when the saved list changes.
    const sig = state.maps.map((m) => m.id + m.name).join() + state.activeMapId;
    const mapsChanged = sig !== mapsSig;
    mapsSig = sig;
    if (cur === "maps" && !mapsChanged) return;
    if (cur === "table" && !mapsChanged && activeMap()) {
      // same map: update in place so panning/zoom and the scroll position survive
      mapView.setMap(activeMap());
      drawTokenList(activeMap());
      return;
    }
    if (LIVE.has(cur)) keepScroll(() => tabset.refresh());
  }, () => { toast("This GM link is no longer valid.", "error"); });

  function drawHeader() {
    const share = shareInfo(state);
    const doExport = () => exportGame(state).catch((e) => toast(e.message, "error"));
    const menu = [
      { icon: "🔗", label: share.inviteLabel, onClick: () => copyText(share.invite) },
      share.private ? { icon: "🔑", label: share.privateLabel, onClick: () => copyText(share.private) } : null,
      { icon: "💾", label: "Export game (JSON)", onClick: doExport },
      { icon: "‹", label: "Exit to the start screen", onClick: () => home && home() },
    ];
    clear(header).append(
      h("button", { class: "small exit-btn", title: "Leave this screen and go back to your games", onclick: () => home && home() }, "‹ Exit"),
      h("span", { class: "title" }, state.name, state.plot.title ? h("span", { class: "hide-mobile" }, `: ${state.plot.title}`) : null),
      h("span", { class: "tag" }, "GM"),
      h("span", { class: "spacer" }),
      h("button", { class: "small code-btn", title: share.inviteLabel, onclick: () => copyText(share.invite) }, h("span", { class: "hide-mobile" }, "Join code "), h("strong", { class: "code" }, state.code)),
      h("span", { class: "top-actions" },
        h("button", { class: "small", onclick: () => copyText(share.invite) }, share.inviteLabel.replace(/^Copy /, "Copy ")),
        share.private ? h("button", { class: "small", title: "Anyone with this link can run this game.", onclick: () => copyText(share.private) }, "Copy GM link") : null,
        h("button", { class: "small", onclick: doExport }, "Export")),
      themeToggle(),
      h("button", { class: "icon-btn menu-btn", title: "Menu", onclick: () => actionSheet(state.name, menu) }, "⋯"));
  }
}
