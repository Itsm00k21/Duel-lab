import { nanoid } from "nanoid";
import type { FormatId } from "./formats";
import type { DeckList } from "./types";

export function toYdk(deck: DeckList) {
  const lines = [
    `#created by Duel Lab`,
    `#main`,
    ...deck.main.map(String),
    `#extra`,
    ...deck.extra.map(String),
    `!side`,
    ...deck.side.map(String),
    "",
  ];
  return lines.join("\n");
}

export function fromYdk(
  text: string,
  opts?: { name?: string; formatId?: FormatId },
): DeckList {
  const main: number[] = [];
  const extra: number[] = [];
  const side: number[] = [];
  let section: "main" | "extra" | "side" | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#created") || line.startsWith("#author")) continue;
    if (line.toLowerCase() === "#main") {
      section = "main";
      continue;
    }
    if (line.toLowerCase() === "#extra") {
      section = "extra";
      continue;
    }
    if (line.toLowerCase() === "!side") {
      section = "side";
      continue;
    }
    if (line.startsWith("#") || line.startsWith("!")) continue;
    const id = Number(line);
    if (!Number.isFinite(id)) continue;
    if (section === "extra") extra.push(id);
    else if (section === "side") side.push(id);
    else main.push(id);
  }

  const now = new Date().toISOString();
  return {
    id: nanoid(),
    name: opts?.name?.trim() || "Imported Deck",
    formatId: opts?.formatId ?? "advanced",
    notes: "",
    main,
    extra,
    side,
    createdAt: now,
    updatedAt: now,
  };
}
