import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CD_INNER, CD_OUTER, JEWEL_ASPECT, isMiniDiscCart, isRound, labelAspect } from "@/lib/media";
import mdFront from "@/assets/minidisc-front-v2.png.asset.json";
import mdBack from "@/assets/minidisc-back-v2.png.asset.json";
import { CD_HOLE } from "@/lib/labelCanvas";
import { useStudio } from "@/lib/store";
import type { LabelObject } from "@/lib/types";
import frontWireframe from "@/assets/floppy-front.svg.asset.json";
import backWireframe from "@/assets/floppy-back.svg.asset.json";


type Gesture =
  | { kind: "move"; id: string; startX: number; startY: number; ox: number; oy: number }
  | { kind: "scale"; id: string; cx: number; cy: number; startDist: number; startW: number }
  | { kind: "rotate"; id: string; cx: number; cy: number; startAngle: number; startRot: number }
  | { kind: "pinch"; id: string; startDist: number; startW: number; startAngle: number; startRot: number };

/** Traced artwork shown as if molded into the plastic shell. */
function MoldPreview({
  object: o,
  shellColor,
  shellOpacity,
}: {
  object: LabelObject;
  shellColor: string;
  shellOpacity: number;
}) {
  const depth = o.moldDepth ?? 0.5;
  const off = 2 * (0.35 + depth);
  const raised = o.mold === "emboss";
  const hi = raised ? -off : off;
  const sh = raised ? off : -off;
  const fill = o.moldFill ?? "shell";
  const body = fill === "custom" ? o.moldColor ?? shellColor : shellColor;
  const bodyAlpha = fill === "clear" ? 0.03 : fill === "custom" ? 0.5 : Math.min(0.16, 0.05 + shellOpacity * 0.14);
  const mask = {
    WebkitMaskImage: `url("${o.src}")`,
    maskImage: `url("${o.src}")`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
  } as const;
  const layer = (color: string, alpha: number, d: number) => (
    <span
      className="pointer-events-none absolute inset-0"
      style={{ ...mask, background: color, opacity: alpha, transform: `translate(${d}%, ${d}%)` }}
    />
  );
  return (
    <div className="pointer-events-none relative w-full" style={{ paddingTop: `${100 / (o.aspect || 1)}%` }}>
      {layer("#05070a", 0.55 * (0.5 + depth), sh)}
      {layer("#ffffff", 0.6 * (0.5 + depth), hi)}
      {layer(body, bodyAlpha, 0)}
    </div>
  );
}

/** Text shown as if molded into the plastic shell. */
function MoldTextPreview({
  object: o,
  shellColor,
  shellOpacity,
}: {
  object: LabelObject;
  shellColor: string;
  shellOpacity: number;
}) {
  const depth = o.moldDepth ?? 0.5;
  const raised = o.mold === "emboss";
  const size = (o.fontSize ?? 0.08) * 100;
  const d = Math.max(0.5, size * 0.05 * (0.35 + depth));
  const hi = raised ? -d : d;
  const sh = raised ? d : -d;
  const fill = o.moldFill ?? "shell";
  const body = fill === "custom" ? o.moldColor ?? shellColor : shellColor;
  const bodyAlpha = fill === "clear" ? 0.03 : fill === "custom" ? 0.5 : Math.min(0.16, 0.05 + shellOpacity * 0.14);
  const base: React.CSSProperties = {
    fontFamily: o.fontFamily ? `"${o.fontFamily}", monospace` : "var(--font-mono)",
    fontSize: `${size}cqh`,
    letterSpacing: `${(o.tracking ?? 0) * 100}%`,
    lineHeight: 1.1,
  };
  const layer = (color: string, alpha: number, off: number, absolute: boolean) => (
    <span
      className={cn("pointer-events-none block whitespace-pre", absolute && "absolute inset-0")}
      style={{
        ...base,
        color,
        opacity: alpha,
        transform: `translate(${off}cqh, ${off}cqh)`,
      }}
    >
      {o.text}
    </span>
  );
  return (
    <span className="pointer-events-none relative block whitespace-pre">
      {layer("#05070a", 0.55 * (0.5 + depth), sh, false)}
      {layer("#ffffff", 0.6 * (0.5 + depth), hi, true)}
      {layer(body, bodyAlpha, 0, true)}
    </span>
  );
}

export function Editor2D() {

  const { design, side, selectedId } = useStudio();
  const select = useStudio((s) => s.select);
  const updateObject = useStudio((s) => s.updateObject);
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [, force] = useState(0);

  const objects = design[side] ?? [];
  const discMode = side === "discFront" || side === "discBack";
  const caseMode = side === "caseFront" || side === "caseBack";
  const wireSide = side === "discBack" || side === "caseBack" ? "back" : side === "discFront" || side === "caseFront" ? "front" : side;
  const aspect = discMode ? 1 : caseMode ? JEWEL_ASPECT : labelAspect(design);

  const rect = () => ref.current!.getBoundingClientRect();

  function onPointerDown(e: React.PointerEvent, o: LabelObject, handle?: "scale" | "rotate") {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    select(o.id);
    const r = rect();
    const cx = r.left + o.x * r.width;
    const cy = r.top + o.y * r.height;
    if (handle === "scale") {
      gesture.current = {
        kind: "scale",
        id: o.id,
        cx,
        cy,
        startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
        startW: o.w,
      };
    } else if (handle === "rotate") {
      gesture.current = {
        kind: "rotate",
        id: o.id,
        cx,
        cy,
        startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
        startRot: o.rot,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        gesture.current = {
          kind: "pinch",
          id: o.id,
          startDist: Math.hypot(b.x - a.x, b.y - a.y),
          startW: o.w,
          startAngle: Math.atan2(b.y - a.y, b.x - a.x),
          startRot: o.rot,
        };
      }
    } else {
      gesture.current = { kind: "move", id: o.id, startX: e.clientX, startY: e.clientY, ox: o.x, oy: o.y };
    }
    force((n) => n + 1);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!gesture.current) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const r = rect();
    if (g.kind === "move") {
      updateObject(
        g.id,
        {
          x: Math.max(0, Math.min(1, g.ox + (e.clientX - g.startX) / r.width)),
          y: Math.max(0, Math.min(1, g.oy + (e.clientY - g.startY) / r.height)),
        },
        false,
      );
    } else if (g.kind === "scale") {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      const scale = dist / Math.max(1, g.startDist);
      updateObject(g.id, { w: Math.max(0.03, Math.min(1.6, g.startW * scale)) }, false);
    } else if (g.kind === "rotate") {
      const ang = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
      updateObject(g.id, { rot: g.startRot + ((ang - g.startAngle) * 180) / Math.PI }, false);
    } else if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      updateObject(
        g.id,
        {
          w: Math.max(0.03, Math.min(1.6, g.startW * (dist / Math.max(1, g.startDist)))),
          rot: g.startRot + ((ang - g.startAngle) * 180) / Math.PI,
        },
        false,
      );
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (gesture.current) {
      const g = gesture.current;
      gesture.current = null;
      // commit current values into history
      const obj = (useStudio.getState().design[side] ?? []).find((o) => o.id === g.id);
      if (obj) updateObject(g.id, { x: obj.x, y: obj.y, w: obj.w, rot: obj.rot }, true);
    }
  }

  const cd = !caseMode && (discMode || isRound(design));
  const md = !discMode && !caseMode && isMiniDiscCart(design);
  const wire = md ? (wireSide === "back" ? mdBack.url : mdFront.url) : wireSide === "back" ? backWireframe.url : frontWireframe.url;
  const hole = (discMode ? 0.12 + (design.discHole ?? 0.5) * 0.24 : CD_HOLE) * 100;
  const cdMask = `radial-gradient(circle closest-side, transparent ${hole}%, rgba(0,0,0,0.4) ${hole + 0.3}%, rgba(0,0,0,0.4) ${CD_INNER * 100}%, #000 ${CD_INNER * 100 + 0.3}%, #000 ${CD_OUTER * 100}%, rgba(0,0,0,0.25) ${CD_OUTER * 100 + 0.3}%, rgba(0,0,0,0.25) 99.6%, transparent 100%)`;

  return (
    <div
      className="relative mx-auto w-full max-w-[520px] touch-none select-none"
      style={{ aspectRatio: String(aspect), maxWidth: `min(520px, calc(44svh * ${aspect}))` }}

    >
      <div
        ref={ref}
        onPointerDown={() => select(null)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "absolute inset-0 overflow-hidden bg-card [container-type:size]",
          cd ? "rounded-full" : "border border-hairline",
        )}
        style={cd ? { WebkitMaskImage: cdMask, maskImage: cdMask } : undefined}
      >
        {!cd && (<div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 opacity-20" style={{ backgroundColor: design.color }} />
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: design.color,
              opacity: 0.9,
              WebkitMaskImage: `url(${wire})`,
              maskImage: `url(${wire})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />
          {md && <img src={wire} alt="" className="absolute inset-0 h-full w-full mix-blend-multiply" draggable={false} />}
        </div>)}
        {cd && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundColor:
                side === "front" && (design.cdFrontOpacity ?? 0) > 0 ? design.cdFrontColor ?? "#e8e8e8" : "var(--muted)",
              opacity: side === "front" && (design.cdFrontOpacity ?? 0) > 0 ? design.cdFrontOpacity : 0.6,
            }}
          />
        )}

        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-55" />
        {cd ? (
          <>
            <span className="pointer-events-none absolute rounded-full border border-hairline" style={{ inset: `${50 - CD_INNER * 50}%` }} />
            <span className="pointer-events-none absolute rounded-full border border-dashed border-hairline" style={{ inset: `${50 - CD_OUTER * 50}%` }} />
          </>
        ) : (
          <>
            <span className="absolute left-2 top-2 size-3 border-l border-t border-hairline" />
            <span className="absolute right-2 top-2 size-3 border-r border-t border-hairline" />
            <span className="absolute bottom-2 left-2 size-3 border-b border-l border-hairline" />
            <span className="absolute bottom-2 right-2 size-3 border-b border-r border-hairline" />
            <span className="absolute inset-x-6 top-[14%] border-t border-dashed border-hairline" />
          </>
        )}

        {objects.map((o) => {
          const selected = o.id === selectedId;
          return (
            <div
              key={o.id}
              onPointerDown={(e) => onPointerDown(e, o)}
              className={cn("absolute", selected && "outline outline-1 outline-foreground")}
              style={{
                left: `${o.x * 100}%`,
                top: `${o.y * 100}%`,
                width: o.type === "image" ? `${o.w * 100}%` : "auto",
                transform: `translate(-50%, -50%) rotate(${o.rot}deg)`,
                opacity: o.opacity,
              }}
            >
              {o.type === "image" && o.mold ? (
                <MoldPreview object={o} shellColor={design.color} shellOpacity={design.opacity} />
              ) : o.type === "image" ? (

                <div className="relative w-full">
                  <img
                    src={o.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none block w-full"
                    style={{ filter: o.stickerKind === "paper" ? `hue-rotate(${o.hue ?? 0}deg)` : undefined }}
                  />
                  {o.stickerKind === "paper" && o.tintMode && o.tintMode !== "original" && (
                    <span
                      className="pointer-events-none absolute inset-0 opacity-80 mix-blend-color"
                      style={{
                        background:
                          o.tintMode === "gradient"
                            ? `linear-gradient(${o.gradientAngle ?? 90}deg, ${o.tintColor ?? "#d9b86c"}, ${o.gradientColor ?? "#e7e0cc"})`
                            : o.tintColor ?? "#d9b86c",
                        WebkitMaskImage: `url(${o.src})`,
                        maskImage: `url(${o.src})`,
                        WebkitMaskSize: "100% 100%",
                        maskSize: "100% 100%",
                      }}
                    />
                  )}
                  {(o.labelImage || o.labelText) && (
                    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[4%]">
                      {o.labelImage && (
                        <img
                          src={o.labelImage}
                          alt=""
                          draggable={false}
                          className="block"
                          style={{ width: `${(o.labelImageScale ?? 0.5) * 100}%` }}
                        />
                      )}
                      {o.labelText && (
                        <span
                          className="block whitespace-pre text-center leading-tight"
                          style={{
                            fontFamily: o.labelFontFamily
                              ? `"${o.labelFontFamily}", monospace`
                              : "var(--font-mono)",
                            fontSize: `${(o.labelSize ?? 0.22) * o.w * 100}cqw`,
                            color: o.labelColor ?? "#1a1a1a",
                          }}
                        >
                          {o.labelText}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              ) : o.mold ? (
                <MoldTextPreview object={o} shellColor={design.color} shellOpacity={design.opacity} />
              ) : (
                <span
                  className="pointer-events-none block whitespace-pre"
                  style={{
                    fontFamily: o.fontFamily ? `"${o.fontFamily}", monospace` : "var(--font-mono)",
                    fontSize: `${(o.fontSize ?? 0.08) * 100}cqh`,
                    color: o.color,
                    letterSpacing: `${(o.tracking ?? 0) * 100}%`,
                    lineHeight: 1.1,
                  }}
                >
                  {o.text}
                </span>
              )}
              {selected && (
                <>
                  <span
                    onPointerDown={(e) => onPointerDown(e, o, "rotate")}
                    className="absolute -top-4 left-1/2 size-3 -translate-x-1/2 cursor-grab border border-foreground bg-background"
                  />
                  <span
                    onPointerDown={(e) => onPointerDown(e, o, "scale")}
                    className="absolute -bottom-2 -right-2 size-3 cursor-nwse-resize border border-foreground bg-foreground"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
