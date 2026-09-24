import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Slider, Toggle, Btn, Field } from "./ui/kit";
import { canvasToDataUrl, compositeOnSticker, defaultProcess, processImage, type ProcessSettings } from "@/lib/imageProcessing";
import { loadImage } from "@/lib/labelCanvas";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ImageImporter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const holo = useStudio((s) => s.holo);
  const paper = useStudio((s) => s.paper);
  const addObject = useStudio((s) => s.addObject);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<ProcessSettings>(defaultProcess);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<ProcessSettings>) => setSettings((s) => ({ ...s, ...patch }));

  useEffect(() => {
    if (!open) {
      setSource(null);
      setBackdrop(null);
      setPreview(null);
      setSettings(defaultProcess);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!source) return;
    (async () => {
      const art = processImage(source, settings);
      const out = backdrop ? await compositeOnSticker(art, await loadImage(backdrop), settings.hue, settings.saturation) : art;
      if (cancelled) return;
      previewRef.current = out;
      setPreview(canvasToDataUrl(out, 512));
    })();
    return () => {
      cancelled = true;
    };
  }, [source, settings, backdrop]);

  async function pickFile(file: File) {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    setSource(img);
  }

  function place() {
    const canvas = previewRef.current;
    if (!canvas) return;
    addObject({
      type: "image",
      x: 0.5,
      y: 0.5,
      w: 0.45,
      aspect: canvas.width / canvas.height,
      rot: 0,
      opacity: 1,
      src: canvasToDataUrl(canvas, 700),
    });
    onClose();
  }

  const backgrounds = useMemo(() => [...holo, ...paper], [holo, paper]);

  return (
    <Modal open={open} onClose={onClose} title="Import" wide>
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
        <div className="space-y-4">
          <div className="blueprint-grid flex aspect-square items-center justify-center border border-hairline">
            {preview && <img src={preview} alt="Preview" className="max-h-full max-w-full object-contain" />}
          </div>

          <div className="space-y-2">
            <Toggle label="Remove background" on={settings.removeBg} onChange={(v) => set({ removeBg: v })} />
            {settings.removeBg && (
              <Slider label="Strength" value={settings.bgThreshold} min={1} max={90} onChange={(v) => set({ bgThreshold: v })} />
            )}
            <Slider label="Colors" value={settings.colors} min={0} max={32} onChange={(v) => set({ colors: v })} />
            <Toggle label="Halftone" on={settings.halftone} onChange={(v) => set({ halftone: v })} />
            {settings.halftone && (
              <Slider label="Dot size" value={settings.halftoneSize} min={2} max={24} onChange={(v) => set({ halftoneSize: v })} />
            )}
            <Toggle label="Threshold" on={settings.threshold} onChange={(v) => set({ threshold: v })} />
            {settings.threshold && (
              <Slider label="Level" value={settings.thresholdLevel} min={1} max={99} onChange={(v) => set({ thresholdLevel: v })} />
            )}
            <Slider label="Distress" value={settings.distress} min={0} max={100} onChange={(v) => set({ distress: v })} />
            <Toggle label="Invert" on={settings.invert} onChange={(v) => set({ invert: v })} />
            <Slider label="Sharpen / blur" value={settings.blur} min={-100} max={100} onChange={(v) => set({ blur: v })} />
          </div>

          <Field label="Sticker background">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setBackdrop(null)}
                className={cn(
                  "aspect-square border border-hairline label-caps text-muted-foreground",
                  !backdrop && "border-foreground text-foreground",
                )}
              >
                None
              </button>
              {backgrounds.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBackdrop(b.src)}
                  className={cn("aspect-square border border-hairline p-1", backdrop === b.src && "border-foreground")}
                >
                  <img src={b.src} alt={b.name} className="size-full object-contain" />
                </button>
              ))}
            </div>
          </Field>

          {backdrop && (
            <div className="space-y-2">
              <Slider label="Hue" value={settings.hue} min={-180} max={180} onChange={(v) => set({ hue: v })} />
              <Slider label="Saturation" value={settings.saturation} min={0} max={200} onChange={(v) => set({ saturation: v })} />
            </div>
          )}

          <div className="flex gap-2">
            <Btn icon="close" label="Reset" className="flex-1" onClick={() => setSource(null)} />
            <Btn icon="check" label="Place" className="flex-1" onClick={place} />
          </div>
        </div>
      )}
    </Modal>
  );
}
