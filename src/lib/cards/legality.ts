import type { CompactCard } from "./types";
import { applyOfficialMdBanlist } from "./mdBanlist";
import { applyOfficialTcgBanlist } from "./tcgBanlist";

/** YGOPRODeck misc_info is sometimes stale. Force known-legal formats/dates. */
const BY_ID: Record<number, Partial<Pick<CompactCard, "formats" | "tcgDate" | "ocgDate">>> = {
  // Primite Fusion — TCG DUAD-EN065 2025-07-03, MD 2025-11-07, OCG 2025-04-26
  99161253: {
    formats: ["TCG", "OCG", "Master Duel"],
    tcgDate: "2025-07-03",
    ocgDate: "2025-04-26",
  },
};

const BY_NAME: Record<string, Partial<Pick<CompactCard, "formats" | "tcgDate" | "ocgDate">>> = {
  "primite fusion": BY_ID[99161253]!,
};

export function applyCardLegalityFixes<T extends CompactCard>(card: T): T {
  const fix = BY_ID[card.id] ?? BY_NAME[card.name.toLowerCase()];
  if (!fix) return applyOfficialMdBanlist(applyOfficialTcgBanlist(card));
  const formats = [...new Set([...(card.formats ?? []), ...(fix.formats ?? [])])];
  return applyOfficialMdBanlist(
    applyOfficialTcgBanlist({
      ...card,
      formats,
      tcgDate: fix.tcgDate ?? card.tcgDate,
      ocgDate: fix.ocgDate ?? card.ocgDate,
    }),
  );
}
