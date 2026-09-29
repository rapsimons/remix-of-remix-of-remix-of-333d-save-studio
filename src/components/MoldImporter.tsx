import { useEffect, useRef, useState } from "react";
import { Modal, Slider, Toggle, Btn, Field } from "./ui/kit";
import { loadImage } from "@/lib/labelCanvas";
import { useStudio } from "@/lib/store";
import { defaultTrace, traceImage, type TraceResult, type TraceSettings } from "@/lib/vectorizer";

/** Import an image, trace it to vector, and mold it into the plastic shell. */
export function MoldImporter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addObject = useStudio((s) => s.addObject);
  const design = useStudio((s) => s.design);
  const fonts = useStudio((s) => s.fonts);
  const [kind, setKind] = useState<"image" | "text">("image");
  const [text, setText] = useState("ARCHIVE");
  const [fontFamily, setFontFamily] = useState("");
  const [fontSize, setFontSize] = useState(0.1);
  const [tracking, setTracking] = useState(0.05);
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
    if (kind === "text") {
      if (!text.trim()) return;
      addObject({
        type: "text",
        x: 0.5,
        y: 0.5,
        w: 0.5,
        rot: 0,
        opacity: 1,
        text,
        fontFamily,
        fontSize,
        tracking,
        color: design.color,
        mold,
        moldFill: fill,
        moldColor: color,
        moldDepth: depth,
      });
      onClose();
      return;
    }
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
  const bodyAlpha = fill === "clear" ? 0.03 : fill === "custom" ? 0.5 : Math.min(0.16, 0.05 + design.opacity * 0.14);
  const textOff = Math.max(0.5, fontSize * 100 * 0.05 * (0.35 + depth));
  const layers = [
    { c: "#05070a", a: 0.55 * (0.5 + depth), d: raised ? off : -off, t: raised ? textOff : -textOff },
    { c: "#ffffff", a: 0.6 * (0.5 + depth), d: raised ? -off : off, t: raised ? -textOff : textOff },
    { c: bodyColor, a: bodyAlpha, d: 0, t: 0 },
  ];
  const ready = kind === "text" ? text.trim().length > 0 : !!traced;

  return (
    <Modal open={open} onClose={onClose} title="Mold into plastic" wide>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        hidden
        onChange={(e) => e.target.files?.[0] && void pickFile(e.target.files[0])}
      />
      <div className="mb-3 grid grid-cols-2 gap-1">
        <Btn icon="image" label="Image" active={kind === "image"} onClick={() => setKind("image")} />
        <Btn icon="text" label="Text" active={kind === "text"} onClick={() => setKind("text")} />
      </div>
      {kind === "image" && !source ? (
        <Btn icon="upload" label="Choose image" className="w-full py-8" onClick={() => fileRef.current?.click()} />
      ) : (
        <div className="space-y-3">
          <div
            className="relative flex aspect-square w-full items-center justify-center overflow-hidden border border-hairline"
            style={{ background: design.color }}
          >
            {kind === "text" ? (
              <span className="relative block whitespace-pre">
                {layers.map((l, i) => (
                  <span
                    key={i}
                    className={i === 0 ? "block whitespace-pre" : "absolute inset-0 block whitespace-pre"}
                    style={{
                      fontFamily: fontFamily ? `"${fontFamily}", monospace` : "var(--font-mono)",
                      fontSize: `${fontSize * 340}px`,
                      letterSpacing: `${tracking * 100}%`,
                      color: l.c,
                      opacity: l.a,
                      transform: `translate(${l.t}px, ${l.t}px)`,
                    }}
                  >
                    {text}
                  </span>
                ))}
              </span>
            ) : (
              preview && (
                <div className="relative w-2/3" style={{ paddingTop: `${(2 / 3) * 100 / (traced?.aspect || 1)}%` }}>
                  {layers.map((l, i) => (
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
              )
            )}
          </div>

          {kind === "text" && (
            <>
              <Field label="Text">
                <input
                  className="h-8 w-full border border-hairline bg-background px-2 text-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
              <Field label="Font">
                <select
                  className="h-8 w-full border border-hairline bg-background px-2 text-sm"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                >
                  <option value="">Default</option>
                  {fonts.map((f) => (
                    <option key={f.id} value={f.family}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Slider label="Size" min={0.02} max={0.4} step={0.005} value={fontSize} onChange={setFontSize} />
              <Slider label="Tracking" min={-0.1} max={0.6} step={0.01} value={tracking} onChange={setTracking} />
            </>
          )}

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
          {kind === "image" && (
            <>
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
              <Slider
                label="Detail"
                min={100}
                max={480}
                step={20}
                value={settings.detail}
                onChange={(v) => set({ detail: v })}
              />
              <Toggle label="Invert" on={settings.invert} onChange={(v) => set({ invert: v })} />
            </>
          )}
          <div className="grid grid-cols-2 gap-1">
            {kind === "image" ? (
              <Btn icon="upload" label="Replace" onClick={() => fileRef.current?.click()} />
            ) : (
              <Btn icon="close" label="Cancel" onClick={onClose} />
            )}
            <Btn icon="check" label="Place" onClick={place} disabled={!ready} />
          </div>
        </div>
      )}
    </Modal>
  );
}
