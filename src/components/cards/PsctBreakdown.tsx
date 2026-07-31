"use client";

import type { CompactCard } from "@/lib/cards/types";
import { cardActivationSpeed, parseCard } from "@/lib/rules/psct";
import { cardRoles } from "@/lib/synergy";

export function PsctBreakdown({ card }: { card: CompactCard }) {
  const clauses = parseCard(card);
  const act = cardActivationSpeed(card);
  const roles = cardRoles(card);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded bg-bg-elev-2 px-2 py-0.5">
          Card activation SS{act || "—"}
        </span>
        {roles.map((role) => (
          <span key={role} className="rounded bg-accent/15 px-2 py-0.5 text-accent">
            {role}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">
        PSCT: text before <strong>:</strong> is timing/condition; before <strong>;</strong> is cost/target;
        after is resolution. Heuristic parse — confirm against the printed card.
      </p>
      {clauses.length === 0 && <p className="text-muted">No activated-effect structure detected.</p>}
      <ul className="space-y-2">
        {clauses.map((clause, i) => (
          <li key={i} className="rounded-lg border border-line bg-bg p-2">
            <div className="mb-1 flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-muted">
              <span>{clause.kind}</span>
              <span>SS{clause.spellSpeed || "0"}</span>
              {clause.mandatory ? <span className="text-danger">mandatory</span> : <span>optional</span>}
              {clause.whenVsIf && <span>{clause.whenVsIf}</span>}
              {clause.fromHand && <span>hand</span>}
              {clause.fromGY && <span>GY</span>}
              {clause.negatesActivation && <span className="text-accent">negate activation</span>}
              {clause.negatesEffect && <span className="text-accent">negate effect</span>}
            </div>
            {clause.condition && (
              <p>
                <span className="text-muted">If/when: </span>
                {clause.condition}
              </p>
            )}
            {clause.cost && (
              <p>
                <span className="text-muted">Cost/target: </span>
                {clause.cost}
              </p>
            )}
            <p>
              <span className="text-muted">Resolve: </span>
              {clause.resolution}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
