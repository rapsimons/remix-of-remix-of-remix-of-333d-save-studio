import { useEffect, useRef, useState } from "react";
import { Modal, Slider, Toggle, Btn, Field } from "./ui/kit";
import { loadImage } from "@/lib/labelCanvas";
import { useStudio } from "@/lib/store";
import { defaultTrace, traceImage, type TraceResult, type TraceSettings } from "@/lib/vectorizer";

/** Import an image, trace it to vector, and mold it into the plastic shell. */
export function MoldImporter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addObject = useStudio((s) => s.addObject);
  const design = useStudio((s) => s.design);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<TraceSettings>(defaultTrace);
  const [mold, setMold] = useState<"deboss" | "emboss">("deboss");
  const [fill, setFill] = useState<"shell" | "clear" | "custom">("shell");
  const [color, setColor] = useState("#8a8f98");
  const [depth, setDepth] = useState(0.5);
  const [traced, setTraced] = useState<TraceResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<TraceSettings>) => setSettings((s) => ({ ...s, ...patch }));

  useEffect(() => {
    if (open) return;
    setSource(null);
    setTraced(null);
    setSettings(defaultTrace);
  }, [open]);

  useEffect(() => {
    if (!source) return;
    setTraced(traceImage(source, settings));
  }, [source, settings]);

  async function pickFile(file: File) {
    const img = await loadImage(URL.createObjectURL(file));
    setSource(img);
  }

  function place() {
    if (!traced) return;
    addObject({
      type: "image",
      x: 0.5,
      y: 0.5,
      w: 0.4,
      aspect: traced.aspect,
      rot: 0,
      opacity: 1,
      src: traced.dataUrl,
      mold,
      moldFill: fill,
      moldColor: color,
      moldDepth: depth,
    });
    onClose();
  }

  const preview = traced?.dataUrl;
  const off = 2 * (0.35 + depth);
  const raised = mold === "emboss";
  const bodyColor = fill === "custom" ? color : design.color;
  const bodyAlpha = fill === "clear" ? 0.07 : fill === "custom" ? 0.8 : Math.min(0.55, 0.2 + design.opacity * 0.45);

  return (
    <Modal open={open} onClose={onClose} title="Mold into plastic" wide>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        hidden
        onChange={(e) => e.target.files?.[0] && void pickFile(e.target.files[0])}
      />
      {!source ? (
        <Btn icon="upload" label="Choose image" className="w-full py-8" onClick={() => fileRef.current?.click()} />
      ) : (
        <div className="space-y-3">
          <div
            className="relative flex aspect-square w-full items-center justify-center border border-hairline"
            style={{ background: design.color }}
          >
            {preview && (
              <div className="relative w-2/3" style={{ paddingTop: `${(2 / 3) * 100 / (traced?.aspect || 1)}%` }}>
                {[
                  { c: "#05070a", a: 0.55 * (0.5 + depth), d: raised ? off : -off },
                  { c: "#ffffff", a: 0.6 * (0.5 + depth), d: raised ? -off : off },
                  { c: bodyColor, a: bodyAlpha, d: 0 },
                ].map((l, i) => (
                  <span
                    key={i}
                    className="absolute inset-0"
                    style={{
                      WebkitMaskImage: `url("${preview}")`,
                      maskImage: `url("${preview}")`,
                      WebkitMaskSize: "100% 100%",
                      maskSize: "100% 100%",
                      background: l.c,
                      opacity: l.a,
                      transform: `translate(${l.d}%, ${l.d}%)`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Btn icon="mold" label="Deboss" active={mold === "deboss"} onClick={() => setMold("deboss")} />
            <Btn icon="mold" label="Emboss" active={mold === "emboss"} onClick={() => setMold("emboss")} />
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(["shell", "clear", "custom"] as const).map((f) => (
              <Btn key={f} label={f} active={fill === f} onClick={() => setFill(f)} />
            ))}
          </div>
          {fill === "custom" && (
            <Field label="Tint">
              <input
                type="color"
                className="h-8 w-full border border-hairline bg-background"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </Field>
          )}
          <Slider label="Depth" min={0} max={1} step={0.05} value={depth} onChange={setDepth} />
          <Slider
            label="Threshold"
            min={0.05}
            max={0.95}
            step={0.01}
            value={settings.threshold}
            onChange={(v) => set({ threshold: v })}
          />
          <Slider
            label="Smoothing"
            min={0}
            max={4}
            step={0.25}
            value={settings.simplify}
            onChange={(v) => set({ simplify: v })}
          />
          <Slider label="Detail" min={100} max={480} step={20} value={settings.detail} onChange={(v) => set({ detail: v })} />
          <Toggle label="Invert" on={settings.invert} onChange={(v) => set({ invert: v })} />
          <div className="grid grid-cols-2 gap-1">
            <Btn icon="upload" label="Replace" onClick={() => fileRef.current?.click()} />
            <Btn icon="check" label="Place" onClick={place} disabled={!traced} />
          </div>
        </div>
      )}
    </Modal>
  );
}
