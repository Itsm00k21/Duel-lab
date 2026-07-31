"use client";

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { frameClass } from "@/lib/cards/compact";
import { cardImageSrc } from "@/lib/cards/images";
import type { CompactCard } from "@/lib/cards/types";
import { cn } from "@/lib/utils";

type Props = {
  card?: CompactCard | null;
  name?: string;
  faceUp?: boolean;
  position?: "atk" | "def";
  compact?: boolean;
  selected?: boolean;
  counters?: number;
  token?: boolean;
  atk?: number;
  def?: number;
  onClick?: () => void;
  className?: string;
};

export function CardProxy({
  card,
  name,
  faceUp = true,
  position = "atk",
  compact,
  selected,
  counters = 0,
  token,
  atk,
  def,
  onClick,
  className,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = cardImageSrc(card?.imageId, compact ? "small" : "full");
  const showArt = Boolean(faceUp && src && !token && !imgFailed);

  useEffect(() => {
    setImgFailed(false);
  }, [card?.id, card?.imageId]);

  function activate(e?: KeyboardEvent | MouseEvent) {
    if (!onClick) return;
    if (e && "key" in e && e.key !== "Enter" && e.key !== " ") return;
    e?.preventDefault();
    onClick();
  }

  if (!faceUp) {
    return (
      <div
        role={onClick ? "button" : "img"}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={activate}
        className={cn(
          "card-proxy relative aspect-[59/86] w-full overflow-hidden rounded-md bg-[radial-gradient(circle_at_30%_20%,#31426b,transparent_40%),linear-gradient(160deg,#10192c,#24345a)]",
          position === "def" && "rotate-90",
          selected && "ring-2 ring-accent",
          className,
        )}
      >
        <div className="absolute inset-2 rounded border border-white/20" />
        <div className="absolute inset-0 grid place-items-center text-[10px] font-bold tracking-[0.3em] text-white/70">
          LAB
        </div>
      </div>
    );
  }

  const title = card?.name ?? name ?? "Unknown";
  const showAtk = card?.atk ?? atk;
  const showDef = card?.def ?? def;
  const frame = token ? "token" : card?.frameType ?? "effect";

  return (
    <div
      role={onClick ? "button" : "img"}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={activate}
      title={card ? `${card.name}\n${card.desc}` : title}
      className={cn(
        "card-proxy relative flex aspect-[59/86] w-full flex-col overflow-hidden rounded-md text-left",
        showArt ? "bg-black" : cn("p-1", frameClass(frame)),
        position === "def" && "rotate-90",
        selected && "ring-2 ring-accent",
        className,
      )}
    >
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src!}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <>
          <div className="truncate rounded-sm bg-black/35 px-1 py-0.5 text-[10px] font-semibold leading-tight">
            {title}
          </div>
          {!compact && (
            <div className="mt-1 flex-1 rounded-sm bg-black/20 p-1 text-[9px] leading-snug opacity-90">
              <div className="line-clamp-6 whitespace-pre-wrap">{card?.desc ?? (token ? "Token" : "")}</div>
            </div>
          )}
          <div className="mt-auto flex items-center justify-between rounded-sm bg-black/35 px-1 py-0.5 text-[9px] font-semibold">
            <span className="truncate">
              {card?.attribute ? `${card.attribute} ` : ""}
              {card?.level != null ? `★${card.level}` : ""}
              {card?.linkval != null ? ` LINK-${card.linkval}` : ""}
              {card?.race ? ` ${card.race}` : ""}
            </span>
            {(showAtk != null || showDef != null) && (
              <span>
                {showAtk ?? "?"}/{showDef ?? "—"}
              </span>
            )}
          </div>
        </>
      )}
      {counters > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-zinc-950">
          {counters}
        </span>
      )}
    </div>
  );
}
