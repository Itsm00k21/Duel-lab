"use client";

import type { GameState, PlayerId } from "@/lib/game/types";
import { FET_HELP, segocOrder } from "@/lib/rules/chain";
import { scanActivations } from "@/lib/rules/scan";
import { cn } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";
import { useGameStore } from "@/store/useGameStore";

export function ChainPanel({ state }: { state: GameState }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const byId = useCardStore((s) => s.byId);
  const fog = Boolean(state.pve || state.pvp);
  const seat: PlayerId | null = state.pve
    ? state.pve.bot === "p1"
      ? "p2"
      : "p1"
    : (state.pvp?.seat ?? (state.view === "god" ? null : state.view));
  const hints = scanActivations(state, byId)
    .filter((c) => {
      if (!c.legal) return false;
      if (fog && seat && c.owner !== seat && /hand|extra|deck/i.test(c.zoneLabel)) return false;
      return true;
    })
    .slice(0, 10);

  const waiting = !state.chain.links.length
    ? "Empty — activate a card to start one."
    : state.chain.complete
      ? "Both players passed. Resolve from the top."
      : state.chain.pendingPlayer
        ? `${state.players[state.chain.pendingPlayer].name} can respond or pass.`
        : "Waiting for a response.";

  return (
    <section className="space-y-3 rounded-xl border border-line bg-bg-elev p-3">
      <div>
        <h3 className="font-semibold">Chain{state.chain.links.length ? ` · ${state.chain.links.length}` : ""}</h3>
        <p className="text-[12px] text-muted">{waiting}</p>
      </div>

      <div className="space-y-1">
        {!state.chain.links.length && <p className="text-xs text-muted">No cards on the chain yet.</p>}
        {[...state.chain.links].reverse().map((link) => (
          <div
            key={link.id}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs",
              link.negated ? "border-danger/40 bg-danger/10" : "border-line bg-bg",
            )}
          >
            <div className="flex justify-between gap-2">
              <span className="font-semibold">
                {link.link}. {link.cardName}
              </span>
              <span className="text-muted">{state.players[link.player].name}</span>
            </div>
            {link.label && <div className="text-muted">{link.label}</div>}
            {link.negated && <div className="text-danger">Negated — skip when resolving</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <button className="rounded-lg bg-bg-elev-2 px-2.5 py-1.5" onClick={() => dispatch({ type: "CHAIN_PASS", player: "p1" })}>
          {state.players.p1.name} pass
        </button>
        <button className="rounded-lg bg-bg-elev-2 px-2.5 py-1.5" onClick={() => dispatch({ type: "CHAIN_PASS", player: "p2" })}>
          {state.players.p2.name} pass
        </button>
        <button
          className="rounded-lg bg-accent px-2.5 py-1.5 font-semibold text-zinc-950"
          onClick={() => dispatch({ type: "CHAIN_RESOLVE_ONE" })}
        >
          Resolve top
        </button>
        <button className="rounded-lg bg-bg-elev-2 px-2.5 py-1.5" onClick={() => dispatch({ type: "CHAIN_NEGATE_TOP" })}>
          Negate top
        </button>
        <button className="rounded-lg bg-bg-elev-2 px-2.5 py-1.5" onClick={() => dispatch({ type: "CHAIN_CLEAR" })}>
          Clear
        </button>
      </div>

      <details className="rounded-lg border border-line bg-bg p-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted">Advanced (timing / hints)</summary>
        <div className="mt-2 rounded-md bg-bg-elev p-2">
          <div className="font-medium">{FET_HELP[state.fetBox].title.replace(/^Box \w+ — /, "")}</div>
          <p className="mt-1 text-muted">{FET_HELP[state.fetBox].body}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(["A", "yellow", "B", "C", "D", "E"] as const).map((box) => (
              <button
                key={box}
                type="button"
                className={cn(
                  "rounded px-1.5 py-0.5",
                  state.fetBox === box ? "bg-accent text-zinc-950" : "bg-bg-elev-2 text-muted",
                )}
                onClick={() => dispatch({ type: "FET", box })}
              >
                {box}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {(
            [
              ["Mark Normal Summon", "Normal Summon"],
              ["Mark Special Summon", "Special Summon"],
              ["Mark card Set", "Card Set"],
              ["Mark attack", "Attack declared"],
              ["Mark destroy", "Destroyed"],
              ["Mark draw", "Drawn"],
            ] as const
          ).map(([label, name]) => (
            <button key={name} className="rounded border border-line px-2 py-1" onClick={() => dispatch({ type: "EVENT", name })}>
              {label}
            </button>
          ))}
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-muted">SEGOC order (TCG)</summary>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-muted">
            {segocOrder().map((step, i) => (
              <li key={i}>
                {step.owner === "turn" ? "Turn player" : "Non-turn player"} {step.bucket} triggers
              </li>
            ))}
          </ol>
        </details>

        <div className="mt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Possible activations</h4>
          <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
            {hints.map((hint, i) => (
              <li key={`${hint.instanceId}-${hint.clauseIndex}-${i}`} className="rounded border border-line/70 p-1.5">
                <button
                  type="button"
                  className="text-left font-medium hover:text-accent"
                  onClick={() =>
                    dispatch({
                      type: "CHAIN_ADD",
                      player: hint.owner,
                      cardId: hint.cardId,
                      cardName: hint.cardName,
                      spellSpeed: hint.spellSpeed,
                      kind: hint.kind,
                      label: hint.summary,
                      instanceId: hint.instanceId,
                      segoc: state.fetBox === "yellow" && hint.spellSpeed === 1,
                    })
                  }
                >
                  {hint.cardName}
                </button>
                <div className="text-muted">
                  {hint.zoneLabel} · {hint.summary}
                </div>
              </li>
            ))}
            {hints.length === 0 && <li className="text-muted">Nothing obvious right now.</li>}
          </ul>
        </div>
      </details>
    </section>
  );
}
