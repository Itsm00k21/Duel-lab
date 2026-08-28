"use client";

import type { CompactCard } from "@/lib/cards/types";
import { cardKind } from "@/lib/cards/kinds";
import type { ZoneCard } from "@/lib/game/types";
import type { ActivationOption } from "@/lib/rules/activationWindow";
import { isFieldSpellCard, staysOnFieldAfterActivate } from "@/lib/rules/stLifecycle";
import { cn } from "@/lib/utils";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";

export type PlayAction =
  | "view"
  | "summon-atk"
  | "summon-def"
  | "ss-atk"
  | "ss-def"
  | "ss-hand"
  | "set-monster"
  | "set-st"
  | "activate-st"
  | "to-field"
  | "to-gy"
  | "to-banish"
  | "to-hand"
  | "flip"
  | "rotate"
  | "attack"
  | "attack-direct"
  | "chain";

type Item = { id: PlayAction; label: string; primary?: boolean; hint?: string; disabled?: boolean };

export function CardActionMenu({
  x,
  y,
  zoneCard,
  data,
  where,
  effectOptions = [],
  canNormalSummon = true,
  normalSummonHint,
  canAttack = false,
  canAttackDirect = false,
  handSSLabel,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  zoneCard: ZoneCard;
  data?: CompactCard;
  where: "hand" | "field" | "st" | "pile" | "extra";
  effectOptions?: ActivationOption[];
  canNormalSummon?: boolean;
  normalSummonHint?: string;
  canAttack?: boolean;
  canAttackDirect?: boolean;
  handSSLabel?: string;
  onAction: (action: PlayAction, option?: ActivationOption) => void;
  onClose: () => void;
}) {
  const sheet = useCoarsePointer();
  const kind = data ? cardKind(data) : "monster";
  const isST = kind === "spell" || kind === "trap" || data?.type.toLowerCase().includes("spell") || data?.type.toLowerCase().includes("trap");
  const isMonster = !isST && kind !== "other";
  const isFieldSpell = Boolean(data && isFieldSpellCard(data));
  const lingeringST = Boolean(isST && data && staysOnFieldAfterActivate(data));
  const oneShotOnField = Boolean(isST && data && !staysOnFieldAfterActivate(data) && (where === "st" || where === "field") && zoneCard.faceUp);

  const effects = oneShotOnField ? [] : effectOptions.filter((o) => o.mode === "effect");
  const cardActs = effectOptions.filter((o) => o.mode === "card");

  const play: Item[] = [];
  if (where === "hand" || where === "extra") {
    if (isMonster || where === "extra") {
      if (where === "extra") {
        play.push(
          { id: "summon-atk", label: "Special Summon ATK", primary: true },
          { id: "summon-def", label: "Special Summon DEF" },
        );
      } else {
        play.push(
          {
            id: "summon-atk",
            label: "Normal Summon ATK",
            primary: canNormalSummon,
            disabled: !canNormalSummon,
            hint: canNormalSummon ? undefined : (normalSummonHint ?? "Already used your Normal Summon this turn."),
          },
          {
            id: "summon-def",
            label: "Normal Summon DEF",
            disabled: !canNormalSummon,
            hint: canNormalSummon ? undefined : (normalSummonHint ?? "Already used your Normal Summon this turn."),
          },
          {
            id: "set-monster",
            label: "Normal Set",
            disabled: !canNormalSummon,
            hint: canNormalSummon ? undefined : (normalSummonHint ?? "Already used your Normal Summon/Set this turn."),
          },
          ...(handSSLabel
            ? [{ id: "ss-hand" as const, label: handSSLabel, primary: true, hint: "Summoning procedure — pay the cost first." }]
            : []),
        );
      }
    }
    if (isST && where === "hand") {
      if (isFieldSpell) {
        if (cardActs.length) {
          play.push({ id: "to-field", label: "Activate Field Spell", primary: true, hint: cardActs[0]?.reason });
        } else {
          play.push({
            id: "to-field",
            label: "Activate Field Spell",
            disabled: true,
            hint: "Needs your Main Phase with an empty chain (Spell Speed 1).",
          });
        }
        play.push({ id: "set-st", label: "Set" });
      } else if (cardActs.length) {
        play.push({ id: "activate-st", label: "Activate", primary: true, hint: cardActs[0]?.reason });
        play.push({ id: "set-st", label: "Set" });
      } else {
        play.push({ id: "set-st", label: "Set" });
      }
    }
  }

  if ((where === "st" || where === "field") && isST && !zoneCard.faceUp && cardActs.length) {
    play.unshift({ id: "activate-st", label: "Activate", primary: true, hint: cardActs[0]?.reason });
  }
  if (where === "field" && isMonster && canAttack) {
    if (canAttackDirect) play.unshift({ id: "attack-direct", label: "Attack directly", primary: true });
    else play.unshift({ id: "attack", label: "Attack", primary: true, hint: "Then tap an opponent's monster." });
  }

  const pose: Item[] = [];
  if (where === "field" && isMonster) {
    if (!zoneCard.faceUp) pose.push({ id: "flip", label: "Flip Summon" });
    if (zoneCard.faceUp) pose.push({ id: "rotate", label: zoneCard.position === "atk" ? "To Defense" : "To Attack" });
  }

  const move: Item[] = [];
  if (where === "field" || where === "st") {
    move.push({ id: "to-gy", label: "To GY" }, { id: "to-banish", label: "To Banish" });
  }

  const left = Math.min(Math.max(8, x), typeof window !== "undefined" ? window.innerWidth - 280 : x);
  const top = Math.min(Math.max(8, y), typeof window !== "undefined" ? window.innerHeight - 460 : y);

  function run(id: PlayAction, option?: ActivationOption, disabled?: boolean) {
    if (disabled) return;
    onAction(id, option);
    onClose();
  }

  const body = (
    <>
      <div className="px-4 pb-1 pt-3">
        <div className="truncate text-sm font-semibold tracking-wide">{data?.name ?? zoneCard.name ?? "Card"}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{data?.type ?? "Unknown"}</div>
        {oneShotOnField && (
          <p className="mt-1 text-[11px] text-amber-200/80">This card already activated — it will go to the GY when the chain resolves.</p>
        )}
      </div>

      {effects.map((opt, i) => (
        <button
          key={`fx-${opt.clauseIndex}-${i}`}
          type="button"
          className="block min-h-11 w-full px-4 py-2.5 text-left font-semibold text-accent hover:bg-white/10 active:bg-white/15"
          onClick={() => run("chain", opt)}
        >
          <div>{effects.length > 1 ? opt.menuLabel : effects.length === 1 && opt.menuLabel !== "Activate effect" ? opt.menuLabel : "Activate effect"}</div>
          <div className="text-[11px] font-normal leading-snug text-white/45">{opt.reason}</div>
        </button>
      ))}

      {play.length > 0 && (
        <Section title="Play">
          {play.map((item, i) => (
            <Row key={`${item.id}-${i}`} item={item} sheet={sheet} onClick={() => run(item.id, cardActs[0], item.disabled)} />
          ))}
        </Section>
      )}
      {pose.length > 0 && (
        <Section title="Position">
          {pose.map((item, i) => (
            <Row key={`${item.id}-${i}`} item={item} sheet={sheet} onClick={() => run(item.id)} />
          ))}
        </Section>
      )}
      {move.length > 0 && (
        <Section title="Move">
          {move.map((item, i) => (
            <Row key={`${item.id}-${i}`} item={item} sheet={sheet} onClick={() => run(item.id)} />
          ))}
        </Section>
      )}
      <Section>
        <Row item={{ id: "view", label: "View card" }} sheet={sheet} onClick={() => run("view")} />
      </Section>
    </>
  );

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      {sheet ? (
        <div
          className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-auto rounded-t-3xl border border-amber-200/20 bg-[#0b1524]/98 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,.55)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/25" />
          {body}
        </div>
      ) : (
        <div
          className="absolute w-[17.5rem] overflow-hidden rounded-2xl border border-amber-200/20 bg-[#0b1524]/96 py-1 shadow-2xl backdrop-blur-md"
          style={{ left, top }}
          onClick={(e) => e.stopPropagation()}
        >
          {body}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mt-1 border-t border-white/10 pt-1">
      {title && <div className="px-4 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">{title}</div>}
      {children}
    </div>
  );
}

function Row({ item, sheet, onClick }: { item: Item; sheet: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={item.disabled}
      className={cn(
        "block min-h-11 w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 active:bg-white/15",
        item.primary && "font-semibold text-amber-200",
        item.disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
        sheet && "min-h-12 text-base",
      )}
      onClick={onClick}
    >
      {item.label}
      {item.hint && <div className="text-[11px] font-normal text-white/40">{item.hint}</div>}
    </button>
  );
}
