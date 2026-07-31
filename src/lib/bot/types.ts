export type BotRole = "combo" | "midrange" | "control" | "stun" | "aggro";

export type BotProfile = {
  premadeId: string;
  name: string;
  role: BotRole;
  /** Short coach note shown on the table. */
  playstyle: string;
  comboOutline: string[];
  endBoard: string[];
  /** Prefer Normal Summoning these first (exact card names). */
  normalSummon: string[];
  /** Engine spells to try activating in Main Phase. */
  engineSpells: string[];
  /** Traps / QP to set going first. */
  setBackrow: string[];
  /** Extra Deck bosses in summon priority (highest first). */
  extraBosses: string[];
  /** Hand/field cards used as chain responders. */
  responders: string[];
  /** Going second: prefer these board-breakers. */
  breakers: string[];
  /** How eagerly to special from Extra when 1+ monster is out (0–1). */
  extraAggression: number;
  /** Auto-accept on-summon / GY triggers. */
  acceptTriggers: boolean;
  /** Pass Battle Phase if fewer than this many attackers. */
  minAttackers: number;
};
