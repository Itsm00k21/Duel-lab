"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cardImageSrc } from "@/lib/cards/images";
import type { CompactCard } from "@/lib/cards/types";
import { FORMATS } from "@/lib/deck/formats";
import { zoneKey } from "@/lib/game/engine";
import type { PileZone } from "@/lib/game/types";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function BoardCard({
  card,
  data,
  forceFaceDown,
  selected,
  compact,
  static: isStatic,
  onClick,
  onContextMenu,
}: {
  card: ZoneCard;
  data?: CompactCard;
  forceFaceDown?: boolean;
  selected?: boolean;
  compact?: boolean;
  static?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const drag = useDraggable({
    id: isStatic ? `static-${card.instanceId}` : card.instanceId,
    disabled: isStatic,
  });
  const { attributes, listeners, setNodeRef, transform, isDragging } = drag;
  const faceUp = forceFaceDown ? false : card.faceUp;
  const src = data ? cardImageSrc(data.imageId, "small") : null;
  const def = card.position === "def" && !compact;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "relative touch-none rounded-[5px] transition duration-150",
        compact ? "h-[4.4rem] w-[3.05rem] sm:h-[4.85rem] sm:w-[3.4rem]" : "h-[5.35rem] w-[3.7rem] sm:h-[6.15rem] sm:w-[4.25rem]",
        def && "rotate-90",
        isDragging && "opacity-40",
        selected && "z-20 ring-2 ring-amber-300 shadow-[0_0_18px_rgba(245,193,93,.45)]",
        "hover:-translate-y-1 hover:z-20",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e);
      }}
      {...listeners}
      {...attributes}
    >
      {faceUp && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={data?.name ?? ""} className="h-full w-full rounded-[5px] object-cover shadow-[0_8px_18px_rgba(0,0,0,.55)]" />
      ) : (
        <div className="card-back flex h-full w-full items-center justify-center rounded-[5px] shadow-[0_8px_18px_rgba(0,0,0,.55)]" />
      )}
      {card.overlay.length > 0 && (
        <span className="absolute -left-1 -top-1 rounded bg-black/80 px-1 text-[9px] text-amber-200">+{card.overlay.length}</span>
      )}
      {card.counters > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 text-[9px] font-bold text-zinc-950">
          {card.counters}
        </span>
      )}
    </button>
  );
}

export function ZoneSlot({
  id,
  active,
  children,
  emz,
}: {
  id: string;
  active?: boolean;
  children?: React.ReactNode;
  emz?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative grid h-[5.7rem] w-[4rem] place-items-center rounded-xl sm:h-[6.55rem] sm:w-[4.55rem]",
        emz ? "zone-slot zone-slot-emz" : "zone-slot",
        isOver && "zone-slot-over",
        active && "ring-1 ring-amber-300/60",
      )}
    >
      {children}
    </div>
  );
}

export function HandStrip({
  cards,
  byId,
  reveal,
  selectedId,
  onCardClick,
  onCardMenu,
  owner,
  opponent,
}: {
  cards: ZoneCard[];
  byId: Map<number, CompactCard>;
  reveal: boolean;
  selectedId?: string | null;
  onCardClick: (card: ZoneCard) => void;
  onCardMenu: (card: ZoneCard, e: React.MouseEvent) => void;
  owner: PlayerId;
  opponent?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneKey({ owner, zone: "hand" }) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[5.2rem] items-end justify-center px-2 py-1",
        isOver && "rounded-2xl bg-amber-300/10",
        opponent && "items-start",
      )}
    >
      {cards.map((card, i) => (
        <div
          key={card.instanceId}
          className="relative"
          style={{
            marginLeft: i === 0 ? 0 : cards.length > 8 ? -22 : -14,
            zIndex: selectedId === card.instanceId ? 40 : i + 1,
          }}
        >
          <BoardCard
            card={card}
            data={byId.get(card.cardId)}
            forceFaceDown={!reveal}
            selected={selectedId === card.instanceId}
            compact
            static={Boolean(opponent)}
            onClick={() => onCardClick(card)}
            onContextMenu={(e) => onCardMenu(card, e)}
          />
        </div>
      ))}
      {cards.length === 0 && <div className="h-14 text-[11px] tracking-wide text-white/25">Hand empty</div>}
    </div>
  );
}

export function SideColumn({
  owner,
  state,
  byId,
  self,
  selectedId,
  onOpenPile,
  onCardClick,
  onCardMenu,
  concealPrivate,
}: {
  owner: PlayerId;
  state: GameState;
  byId: Map<number, CompactCard>;
  self: boolean;
  selectedId?: string | null;
  onOpenPile: (owner: PlayerId, zone: "deck" | "extra" | "gy" | "banish") => void;
  onCardClick: (card: ZoneCard) => void;
  onCardMenu: (card: ZoneCard, e: React.MouseEvent) => void;
  /** Hide deck/ED identities (bot / online fog). */
  concealPrivate?: boolean;
}) {
  const p = state.players[owner];
  const pileBtn = (
    zone: Extract<PileZone, "deck" | "extra" | "gy" | "banish">,
    label: string,
    count: number,
    top?: ZoneCard,
    faceDown?: boolean,
  ) => (
    <div className="flex w-[3.9rem] flex-col items-center gap-0.5 text-[10px] tracking-wide text-white/55">
      {top && !(concealPrivate && (zone === "extra" || zone === "deck")) ? (
        <BoardCard
          card={top}
          data={byId.get(top.cardId)}
          forceFaceDown={faceDown || zone === "deck" || zone === "extra"}
          compact
          static={zone === "deck" || zone === "extra" || zone === "gy" || zone === "banish" || !self}
          selected={selectedId === top.instanceId}
          onClick={() =>
            faceDown || zone === "deck" || zone === "extra" || concealPrivate
              ? onOpenPile(owner, zone)
              : onCardClick(top)
          }
          onContextMenu={(e) => {
            if (zone === "deck" || zone === "extra") {
              e.preventDefault();
              onOpenPile(owner, zone);
              return;
            }
            onCardMenu(top, e);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpenPile(owner, zone)}
          className="zone-slot grid h-16 w-11 place-items-center text-[9px] text-white/30"
        >
          {label}
        </button>
      )}
      <button type="button" className="hover:text-amber-200" onClick={() => onOpenPile(owner, zone)}>
        {zone === "extra" ? "Extra" : label} {count}
      </button>
    </div>
  );

  const fieldDrop = useDroppable({ id: zoneKey({ owner, zone: "field" }) });
  const gyDrop = useDroppable({ id: zoneKey({ owner, zone: "gy" }) });
  const banDrop = useDroppable({ id: zoneKey({ owner, zone: "banish" }) });

  const stack = (
    <>
      {pileBtn("extra", "ED", p.extra.length, p.extra[0], Boolean(concealPrivate))}
      <div ref={fieldDrop.setNodeRef} className={cn(fieldDrop.isOver && "rounded-xl ring-1 ring-amber-300")}>
        {p.field ? (
          <BoardCard
            card={p.field}
            data={byId.get(p.field.cardId)}
            selected={selectedId === p.field.instanceId}
            compact
            static={!self}
            onClick={() => onCardClick(p.field!)}
            onContextMenu={(e) => onCardMenu(p.field!, e)}
          />
        ) : (
          <div className="zone-slot grid h-16 w-[3.9rem] place-items-center text-[9px] text-white/30">Field</div>
        )}
      </div>
      <div ref={self ? gyDrop.setNodeRef : undefined} className={cn(self && gyDrop.isOver && "rounded-xl ring-1 ring-amber-300")}>
        {pileBtn("gy", "GY", p.gy.length, p.gy[0], false)}
      </div>
      <div ref={self ? banDrop.setNodeRef : undefined} className={cn(self && banDrop.isOver && "rounded-xl ring-1 ring-amber-300")}>
        {pileBtn("banish", "Ban", p.banish.length, p.banish[0], !p.banish[0]?.faceUp)}
      </div>
      {pileBtn("deck", "Deck", p.deck.length, p.deck[0], true)}
    </>
  );

  return <div className={cn("flex flex-col items-center gap-1.5", !self && "flex-col-reverse")}>{stack}</div>;
}

export function MonsterRow({
  owner,
  cards,
  byId,
  selectedId,
  onCardClick,
  onCardMenu,
  dragDisabled,
}: {
  owner: PlayerId;
  cards: Array<ZoneCard | null>;
  byId: Map<number, CompactCard>;
  selectedId?: string | null;
  onCardClick: (card: ZoneCard) => void;
  onCardMenu: (card: ZoneCard, e: React.MouseEvent) => void;
  dragDisabled?: boolean;
}) {
  return (
    <div className="flex justify-center gap-1.5">
      {cards.map((card, i) => (
        <ZoneSlot key={`${owner}-m-${i}`} id={zoneKey({ owner, zone: "monster", index: i })}>
          {card && (
            <BoardCard
              card={card}
              data={byId.get(card.cardId)}
              selected={selectedId === card.instanceId}
              static={dragDisabled}
              onClick={() => onCardClick(card)}
              onContextMenu={(e) => onCardMenu(card, e)}
            />
          )}
        </ZoneSlot>
      ))}
    </div>
  );
}

export function SpellRow({
  owner,
  cards,
  byId,
  selectedId,
  onCardClick,
  onCardMenu,
  dragDisabled,
}: {
  owner: PlayerId;
  cards: Array<ZoneCard | null>;
  byId: Map<number, CompactCard>;
  selectedId?: string | null;
  onCardClick: (card: ZoneCard) => void;
  onCardMenu: (card: ZoneCard, e: React.MouseEvent) => void;
  dragDisabled?: boolean;
}) {
  return (
    <div className="flex justify-center gap-1.5">
      {cards.map((card, i) => (
        <ZoneSlot key={`${owner}-st-${i}`} id={zoneKey({ owner, zone: "st", index: i })}>
          {card && (
            <BoardCard
              card={card}
              data={byId.get(card.cardId)}
              selected={selectedId === card.instanceId}
              static={dragDisabled}
              onClick={() => onCardClick(card)}
              onContextMenu={(e) => onCardMenu(card, e)}
            />
          )}
        </ZoneSlot>
      ))}
    </div>
  );
}

export function EmzRow({
  state,
  byId,
  selectedId,
  onCardClick,
  onCardMenu,
}: {
  state: GameState;
  byId: Map<number, CompactCard>;
  selectedId?: string | null;
  onCardClick: (card: ZoneCard) => void;
  onCardMenu: (card: ZoneCard, e: React.MouseEvent) => void;
}) {
  if (!FORMATS[state.formatId].usesExtraMonsterZones) return null;
  return (
    <div className="flex justify-center gap-14 py-0.5">
      {[0, 1].map((i) => (
        <ZoneSlot key={`emz-${i}`} id={zoneKey({ owner: "shared", zone: "emz", index: i as 0 | 1 })} emz>
          {state.emz[i] && (
            <BoardCard
              card={state.emz[i]!}
              data={byId.get(state.emz[i]!.cardId)}
              selected={selectedId === state.emz[i]!.instanceId}
              onClick={() => onCardClick(state.emz[i]!)}
              onContextMenu={(e) => onCardMenu(state.emz[i]!, e)}
            />
          )}
        </ZoneSlot>
      ))}
    </div>
  );
}
