// AI features: handout text for GMs, and the AI game master for tables
// without one. Shared by the server (Claude API) and the hosted version (the
// page's own Claude access).
const MAP_STYLE = "Describe places the way the app's map builder reads them: say what kind of place it is (a dungeon or crypt with rooms, a natural cave, the outdoors, a town or village, or a single building's interior), its size (small, medium or large), how lit it is (bright, dim or dark), where the entrance is (north, south, east or west), and what's in it and where things are relative to each other, in short plain clauses: \"an altar behind the throne\", \"two statues flank the door\", \"a well north of the inn\", \"a river running north to south along the eastern side\", \"a campfire in front of the ruined tower\", \"three tents around the fire\", \"a pool of lava in the middle with a bridge across it\". Use concrete nouns (altar, throne, statue, pillars, sarcophagus, chest, table, crates, campfire, brazier, tents, trees, boulders, bones, cage, well, fountain, bridge, chasm, lake, river, stairs, hut, tower, wagon).";

export const TASKS = {
  gm: `You are the game master for this Pathfinder Second Edition (Remaster) table; there is no human GM. Given the situation and what the players say they do, narrate what happens in one to three short paragraphs, in second person plural, vivid but brief. Rules: When the outcome is uncertain, don't decide it: call for a check with a skill or save and a DC from the GM Core DC-by-level table for the party's level, on its own line as: CHECK: Athletics DC 16. When the players roll, the result appears in the recent table talk; narrate the consequence. Use the plot as the truth of the world and reveal secrets only when the characters discover them. Keep player agency: end with what the characters see or a short question, never decide what they do. You can change the table with commands, each alone on its own line, in square brackets, used only when the story calls for it: [MAP: description] when the party arrives somewhere new that needs a battle map (one per reply, at most). ${MAP_STYLE} [ENCOUNTER: 3 goblin warrior, 1 goblin war chanter] when a fight starts, naming Pathfinder Monster Core creatures suited to the party's level and size, using the Encounter budget (moderate threat by default). [NOTE: one-line summary] to record an important event or clue in the story log. Don't explain the commands; the app carries them out.`,
  adventure: `Invent a short Pathfinder Second Edition adventure for this party (two to four sessions) that an AI game master will run. Reply with JSON only, no prose, in this shape: {"title":"","setting":"","tone":"","synopsis":"","hooks":"","acts":[{"title":"","summary":""}],"npcs":[{"name":"","role":"","ancestry":"","description":"","secret":"","location":""}],"locations":[{"name":"","type":"dungeon|cave|wilderness|town|tavern","description":""}],"secrets":[{"text":"","location":""}],"rewards":""}. Use three acts, three to five NPCs and three to five locations. Each location's description is used to build its battle map, so write it for that: ${MAP_STYLE}`,
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


export const SYSTEM = "You help run a Pathfinder Second Edition (Remaster) tabletop game. Write in plain prose without markdown headings or bullet lists unless asked. Keep it usable at the table.";

export function userPrompt(game, task, prompt) {
  const instructions = TASKS[task];
  if (!instructions) throw new Error("The AI writes handouts and runs games without a GM, nothing else.");
  // the GM needs to see the dice as well as the talk
  const line = (l) => (l.type === "roll" ? `${l.who || "Someone"} rolled ${l.label || l.roll?.formula || "dice"}: ${l.roll?.total}${l.dc ? ` vs DC ${l.dc}` : ""}${l.outcome ? ` (${l.outcome})` : ""}` : `${l.who || "System"}: ${l.text || ""}`);
  const recent = (game.log || []).filter((l) => task === "gm" || l.type !== "roll").slice(task === "gm" ? -30 : -15).map(line).join("\n");
  const map = (game.maps || []).find((m) => m.id === game.activeMapId) || game.map;
  const where = map ? `\n\nCurrent battle map: ${map.name}${map.description ? ` (built from: ${map.description})` : ""}` : "";
  const fight = game.initiative?.active ? `\nA fight is under way, round ${game.initiative.round}: ${game.initiative.entries.map((e) => `${e.name}${e.kind === "enemy" ? ` (enemy${e.hp !== undefined ? `, ${e.hp}/${e.maxHp} HP` : e.hpState ? `, ${e.hpState}` : ""})` : ""}`).join(", ")}.` : "";
  return `${instructions}${where}${fight}\n\nRecent table talk:\n${recent || "(none)"}\n\n${task === "gm" ? "Players" : "Request"}: ${String(prompt || "").slice(0, 4000)}`;
}
