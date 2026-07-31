import type { FormatId } from "./formats";

export type DeckList = {
  id: string;
  name: string;
  formatId: FormatId;
  notes: string;
  main: number[];
  extra: number[];
  side: number[];
  createdAt: string;
  updatedAt: string;
};

export type DeckIssue = {
  level: "error" | "warn";
  message: string;
};

export type DeckStats = {
  main: number;
  extra: number;
  side: number;
  monsters: number;
  spells: number;
  traps: number;
  genesysPoints: number;
};
