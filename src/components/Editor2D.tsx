import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LABEL_ASPECT } from "@/lib/labelCanvas";
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
  const bodyAlpha = fill === "clear" ? 0.07 : fill === "custom" ? 0.8 : Math.min(0.55, 0.2 + shellOpacity * 0.45);
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

export function Editor2D() {

  const { design, side, selectedId } = useStudio();
  const select = useStudio((s) => s.select);
  const updateObject = useStudio((s) => s.updateObject);
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [, force] = useState(0);

  const objects = design[side];

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
      const obj = useStudio.getState().design[side].find((o) => o.id === g.id);
      if (obj) updateObject(g.id, { x: obj.x, y: obj.y, w: obj.w, rot: obj.rot }, true);
    }
  }

  return (
    <div
      className="relative mx-auto w-full max-w-[520px] touch-none select-none"
      style={{ aspectRatio: String(LABEL_ASPECT) }}

    >
      <div
        ref={ref}
        onPointerDown={() => select(null)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 overflow-hidden border border-hairline bg-card [container-type:size]"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 opacity-20" style={{ backgroundColor: design.color }} />
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: design.color,
              opacity: 0.9,
              WebkitMaskImage: `url(${side === "back" ? backWireframe.url : frontWireframe.url})`,
              maskImage: `url(${side === "back" ? backWireframe.url : frontWireframe.url})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />
        </div>


        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-55" />
        {/* registration marks */}
        <span className="absolute left-2 top-2 size-3 border-l border-t border-hairline" />
        <span className="absolute right-2 top-2 size-3 border-r border-t border-hairline" />
        <span className="absolute bottom-2 left-2 size-3 border-b border-l border-hairline" />
        <span className="absolute bottom-2 right-2 size-3 border-b border-r border-hairline" />
        <span className="absolute inset-x-6 top-[14%] border-t border-dashed border-hairline" />

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
