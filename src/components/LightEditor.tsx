import { useRef, useState } from "react";
import type { Design, SceneLight } from "@/lib/types";
import { useStudio } from "@/lib/store";
import { Slider } from "./ui/kit";

const PALETTE = ["#ff2d75", "#00e5ff", "#ffd400", "#7c4dff", "#39ff88", "#ffffff"];

/** Full-surface overlay: tap empty space to add a light, drag dots to move, tap a dot to edit. */
export function LightEditor({ design, onDone }: { design: Design; onDone: () => void }) {
  const store = useStudio();
  const lights = design.lights ?? [];
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);

  const toNorm = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((cx - r.left) / r.width) * 2 - 1;
    const y = ((cy - r.top) / r.height) * 2 - 1;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  };
  const update = (id: string, fn: (l: SceneLight) => void) =>
    store.patch((d) => {
      const l = d.lights?.find((x) => x.id === id);
      if (l) fn(l);
    });

  const current = lights.find((l) => l.id === sel);

  return (
    <div className="absolute inset-0 z-10 touch-none">
      <div
        ref={ref}
        className="absolute inset-0 bg-background/10"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (sel) return setSel(null);
          const { x, y } = toNorm(e.clientX, e.clientY);
          const id = crypto.randomUUID();
          store.patch((d) => {
            d.lights = [...(d.lights ?? []), { id, x, y, color: PALETTE[(d.lights?.length ?? 0) % PALETTE.length]!, intensity: 1 }];
          });
          setSel(id);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          drag.current.moved = true;
          const { x, y } = toNorm(e.clientX, e.clientY);
          update(drag.current.id, (l) => {
            l.x = x;
            l.y = y;
          });
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) setSel(drag.current.id);
          drag.current = null;
        }}
      >
        {lights.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-label="Light source"
            className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground"
            style={{
              left: `${(l.x + 1) * 50}%`,
              top: `${(l.y + 1) * 50}%`,
              backgroundColor: l.color,
              boxShadow: `0 0 ${10 + l.intensity * 18}px ${l.color}`,
              outline: sel === l.id ? "2px solid currentColor" : undefined,
              outlineOffset: 3,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              ref.current!.setPointerCapture(e.pointerId);
              drag.current = { id: l.id, moved: false };
            }}
          />
        ))}
        {lights.length === 0 && (
          <span className="pointer-events-none absolute inset-x-0 top-1/2 text-center label-caps text-foreground">
            Tap to add a light
          </span>
        )}
      </div>

      {current && (
        <div className="absolute inset-x-2 bottom-2 space-y-2 border border-hairline bg-background/95 p-2 backdrop-blur">
          <div className="flex items-center gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                className="size-7 shrink-0 rounded-full border border-hairline"
                style={{ backgroundColor: c }}
                onClick={() => update(current.id, (l) => void (l.color = c))}
              />
            ))}
            <input
              type="color"
              aria-label="Light color"
              className="h-7 min-w-0 flex-1 border border-hairline bg-background"
              value={current.color}
              onChange={(e) => update(current.id, (l) => void (l.color = e.target.value))}
            />
          </div>
          <Slider label="Intensity" min={0.1} max={3} step={0.1} value={current.intensity} onChange={(v) => update(current.id, (l) => void (l.intensity = v))} />
          <button
            type="button"
            className="label-caps w-full border border-hairline py-2 hover:bg-accent"
            onClick={() => {
              store.patch((d) => {
                d.lights = (d.lights ?? []).filter((x) => x.id !== current.id);
              });
              setSel(null);
            }}
          >
            Remove light
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="label-caps absolute left-3 top-3 rounded-full border border-hairline bg-background/90 px-4 py-2"
      >
        Done
      </button>
    </div>
  );
}
