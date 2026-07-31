import { isCardActivationTrigger } from "./effectOpt";
import { parseCard, type ParsedClause } from "./psct";
import type { CompactCard } from "@/lib/cards/types";

/** Clause that represents activating the S/T card itself (not destroy/GY follow-ups). */
export function pickCardActivationClause(card: CompactCard): { clause: ParsedClause | null; index: number } {
  const clauses = parseCard(card);
  const activationIdx = clauses.findIndex((c) => isCardActivationTrigger(c));
  if (activationIdx >= 0) return { clause: clauses[activationIdx]!, index: activationIdx };

  const destroyLike = /^if this card is destroyed|^if this card is sent|^if this card is banished/i;
  const idx = clauses.findIndex(
    (c) =>
      c.kind === "activation" &&
      !isCardActivationTrigger(c) &&
      !c.fromGY &&
      !c.fromBanished &&
      !destroyLike.test(`${c.condition ?? ""} ${c.raw}`),
  );
  if (idx >= 0) return { clause: clauses[idx]!, index: idx };
  const fallback = clauses.findIndex((c) => c.kind === "activation" && !c.fromGY);
  if (fallback >= 0) return { clause: clauses[fallback]!, index: fallback };
  return { clause: null, index: -1 };
}

export function cardActivationLabel(card: CompactCard): string {
  const { clause } = pickCardActivationClause(card);
  if (!clause) return `Activate ${card.name}`;
  const text = (clause.resolution || clause.condition || clause.raw).replace(/\s+/g, " ").trim();
  if (/^activate 1 of these effects/i.test(text) || /^●/.test(text)) return `Activate ${card.name}`;
  return text.slice(0, 140) || `Activate ${card.name}`;
}
