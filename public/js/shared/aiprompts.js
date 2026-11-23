// The one AI feature: writing handout text. Shared by the server (Claude API)
// and the hosted version (the page's own Claude access).
export const TASKS = {
  map: "Read the GM's description of a place for a battle map and reply with JSON only, no prose: {\"type\":\"dungeon|cave|wilderness|town|tavern\",\"size\":\"small|medium|large\",\"rooms\":null,\"buildings\":null,\"underground\":false,\"layout\":null,\"landmark\":null,\"buildingKinds\":[],\"features\":[]}. type: dungeon for built interiors with rooms and corridors (crypts, temples, keeps, sewers), cave for natural caverns and mines, wilderness for outdoors, town for streets and buildings, tavern for a single building's interior. rooms or buildings: a number only if the description gives one. underground: true if the place is below ground. layout: \"strip\" if buildings line a single long street, else null. landmark: \"ziggurat\" for a stepped pyramid or ziggurat, else null. buildingKinds: only kinds the description names, from Tavern, Smithy, Temple, Shrine, Shop, Barracks, Jail, Warehouse, Stables, Hall, Library, Workshop, Cult house (ordinary homes are implied). features: any of river, lake, bridge, chasm, pillars, altar, statue, rubble, ruins, camp, road, noRoad, stairs, furniture, swamp, sand, denseTrees, openGround, ramshackle that the description implies.",
  handout: "Write the text of an in-world handout (letter, notice, journal page, poster, etc.). Write only what appears on the document itself, in the voice of whoever wrote it. Include only information the GM says the players should get.",
};

export function context(game) {
  const p = game.plot;
  const lines = [
    `Campaign: ${game.name}`,
    p.title && `Adventure: ${p.title}`,
    `Party level: ${p.partyLevel}`,
    p.setting && `Setting: ${p.setting}`,
    p.tone && `Tone: ${p.tone}`,
    p.synopsis && `Synopsis: ${p.synopsis}`,
    p.hooks && `Hooks: ${p.hooks}`,
    p.acts?.length && "Acts:\n" + p.acts.map((a, i) => `  ${i + 1}. ${a.title}: ${a.summary}`).join("\n"),
    p.npcs?.length && "NPCs:\n" + p.npcs.map((n) => `  - ${n.name} (${n.role || "?"}${n.ancestry ? ", " + n.ancestry : ""}): ${n.description || ""}${n.secret ? " SECRET: " + n.secret : ""}`).join("\n"),
    p.locations?.length && "Locations:\n" + p.locations.map((l) => `  - ${l.name} [${l.type}]: ${l.description || ""}`).join("\n"),
    p.factions && `Factions: ${p.factions}`,
    p.secrets?.length && "Secrets and clues:\n" + p.secrets.map((s) => `  - ${s.text}${s.revealed ? " (revealed)" : " (not yet revealed)"}`).join("\n"),
    game.notes.length && "Session notes from the GM (newest last):\n" + game.notes.slice(-40).map((n) => `  - ${n.text}${n.public ? " (shared with players)" : ""}`).join("\n"),
    "Party:\n" + game.slots.filter((s) => s.characterId && game.characters[s.characterId]).map((s) => {
      const c = game.characters[s.characterId];
      return `  - ${c.name}, level ${c.level} ${c.ancestry} ${c.class}${s.type === "companion" ? " (companion" + (s.personality ? ": " + s.personality : "") + ")" : ""}`;
    }).join("\n"),
  ];
  return lines.filter(Boolean).join("\n");
}


export const SYSTEM = "You are a helpful assistant to the Game Master of a Pathfinder Second Edition (Remaster) tabletop game. Write in plain prose without markdown headings. Keep answers usable at the table.";

export function userPrompt(game, task, prompt) {
  const instructions = TASKS[task];
  if (!instructions) throw new Error("The AI only reads map descriptions and writes handouts.");
  const recent = game.log.filter((l) => l.type !== "roll").slice(-15).map((l) => `${l.who || "System"}: ${l.text || ""}`).join("\n");
  return `${instructions}\n\nRecent table talk:\n${recent || "(none)"}\n\nGM request: ${String(prompt || "").slice(0, 4000)}`;
}
