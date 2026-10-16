import { useEffect, useRef, useState } from "react";
import { Btn, Drawer, Field, Modal, Slider, inputClass } from "./ui/kit";
import { Icon } from "./ui/Icon";
import { Editor2D } from "./Editor2D";
import { FloppyViewer } from "./FloppyViewer";
import { ImageImporter } from "./ImageImporter";
import { MoldImporter } from "./MoldImporter";

import { DesignGallery, FontGallery, ModelGallery, StickerGallery } from "./Galleries";
import { useStudio } from "@/lib/store";
import { useTheme } from "@/lib/useTheme";
import { encodeDesign } from "@/lib/share";
import { renderLabel } from "@/lib/labelCanvas";
import { defaultAlignment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CD_BACKS, cdBackColor, isCd, VARIANTS, type CdBackStyle } from "@/lib/media";

type Panel = "holo" | "paper" | "fonts" | "designs" | "models" | "import" | "links" | "mold" | null;
type Mode = "design" | "view" | "align";

export function Studio() {
  const store = useStudio();
  const { design, side, selectedId } = store;
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>("design");
  const [panel, setPanel] = useState<Panel>(null);
  const [lockX, setLockX] = useState(false);
  const [lockY, setLockY] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const stampRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const toggleDrawer = (k: string) => setDrawer((d) => (d === k ? null : k));

  useEffect(() => {
    void store.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const selected = design[side].find((o) => o.id === selectedId) ?? null;

  async function share() {
    const code = await encodeDesign(design);
    const url = `${window.location.origin}/v#${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: design.name, url });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(url);
    setToast("Link copied");
  }

  async function download() {
    const canvas = await renderLabel(design[side], 2048);
    const a = document.createElement("a");
    a.download = `${design.name}-${side}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return (
    <div className="flex h-[100svh] flex-col bg-background text-foreground">
      {/* header */}
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <input
          value={design.name}
          onChange={(e) =>
            store.patch((d) => {
              d.name = e.target.value;
            })
          }
          className="min-w-0 flex-1 bg-transparent label-caps outline-none"
          aria-label="Design name"
        />
        <button type="button" onClick={toggle} aria-label="Theme">
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </header>

      {/* media switch */}
      <nav className="grid grid-cols-4 border-b border-hairline" aria-label="Media type">
        {([
          ["floppy", "Floppy"],
          ["cd", "CD"],
          ["minidisc", "Case"],
          ["ps1", "M.Card"],
        ] as const).map(([k, label]) => {
          const active = (design.mediaType ?? "floppy") === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() =>
                store.patch((d) => {
                  d.mediaType = k;
                  d.modelVariant = "v1";
                })
              }
              className={cn(
                "truncate whitespace-nowrap px-1 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground",
                active && "bg-foreground text-background",
              )}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {(VARIANTS[design.mediaType ?? "floppy"] ?? []).length > 0 && (
        <nav className="flex items-center justify-center gap-1 border-b border-hairline py-1" aria-label="Model version">
          {(VARIANTS[design.mediaType ?? "floppy"] ?? []).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() =>
                store.patch((d) => {
                  d.modelVariant = v;
                })
              }
              className={cn(
                "rounded-full border border-hairline px-3 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground",
                (design.modelVariant ?? "v1") === v && "bg-foreground text-background",
              )}
            >
              {v}
            </button>
          ))}
        </nav>
      )}

      {/* mode switch */}
      <nav className="grid grid-cols-3 border-b border-hairline">
        {(["design", "view", "align"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("label-caps py-2 text-muted-foreground", mode === m && "bg-foreground text-background")}
          >
            {m}
          </button>
        ))}
      </nav>

      <main className="relative flex-1 overflow-y-auto">
        {mode === "design" && (
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(["front", "back"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => store.setSide(s)}
                    className={cn(
                      "label-caps border border-hairline px-3 py-1.5",
                      side === s && "bg-foreground text-background",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <Btn icon="undo" onClick={store.undo} disabled={store.past.length === 0} aria-label="Undo" />
                <Btn icon="redo" onClick={store.redo} disabled={store.future.length === 0} aria-label="Redo" />
              </div>
            </div>

            <Editor2D />

            <div className="grid grid-cols-6 gap-1 [&>button]:min-w-0 [&>button]:px-0.5 [&_span]:text-[9px] [&_span]:tracking-wider">
              <Btn
                icon="text"
                label="Text"
                onClick={() =>
                  store.addObject({
                    type: "text",
                    x: 0.5,
                    y: 0.5,
                    w: 0.5,
                    rot: 0,
                    opacity: 1,
                    text: "LABEL",
                    fontSize: 0.09,
                    color: theme === "dark" ? "#f2f2f2" : "#111111",
                    tracking: 0.05,
                  })
                }
              />
              <Btn icon="image" label="Image" onClick={() => setPanel("import")} />
              <Btn icon="sticker" label="Holo" onClick={() => setPanel("holo")} />
              <Btn icon="sticker" label="Paper" onClick={() => setPanel("paper")} />
              <Btn icon="font" label="Fonts" onClick={() => setPanel("fonts")} />
              <Btn icon="mold" label="Mold" onClick={() => setPanel("mold")} />

            </div>

            {selected && (
              <section className="space-y-2 border border-hairline p-3">
                <div className="flex items-center justify-between">
                  <span className="label-caps text-muted-foreground">Selected</span>
                  <div className="flex gap-1">
                    <Btn icon="up" aria-label="Raise" onClick={() => store.raiseObject(selected.id, 1)} />
                    <Btn icon="down" aria-label="Lower" onClick={() => store.raiseObject(selected.id, -1)} />
                    <Btn icon="delete" aria-label="Delete" onClick={() => store.removeObject(selected.id)} />
                  </div>
                </div>
                {selected.type === "text" && (
                  <>
                    <Field label="Text">
                      <input
                        className={inputClass}
                        value={selected.text ?? ""}
                        onChange={(e) => store.updateObject(selected.id, { text: e.target.value })}
                      />
                    </Field>
                    <Field label="Font">
                      <select
                        className={inputClass}
                        value={selected.fontFamily ?? ""}
                        onChange={(e) => store.updateObject(selected.id, { fontFamily: e.target.value })}
                      >
                        <option value="">Default</option>
                        {store.fonts.map((f) => (
                          <option key={f.id} value={f.family}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Slider
                      label="Size"
                      min={0.02}
                      max={0.4}
                      step={0.005}
                      value={selected.fontSize ?? 0.09}
                      onChange={(v) => store.updateObject(selected.id, { fontSize: v }, false)}
                    />
                    <Slider
                      label="Tracking"
                      min={-0.1}
                      max={0.6}
                      step={0.01}
                      value={selected.tracking ?? 0}
                      onChange={(v) => store.updateObject(selected.id, { tracking: v }, false)}
                    />
                    <Field label="Color">
                      <input
                        type="color"
                        className="h-8 w-full border border-hairline bg-background"
                        value={selected.color ?? "#111111"}
                        onChange={(e) => store.updateObject(selected.id, { color: e.target.value }, false)}
                      />
                    </Field>
                    <div className="grid grid-cols-3 gap-1" aria-label="Text finish">
                      <Btn
                        label="Print"
                        active={!selected.mold}
                        onClick={() => store.updateObject(selected.id, { mold: undefined })}
                      />
                      <Btn
                        icon="mold"
                        label="Deboss"
                        active={selected.mold === "deboss"}
                        onClick={() => store.updateObject(selected.id, { mold: "deboss" })}
                      />
                      <Btn
                        icon="mold"
                        label="Emboss"
                        active={selected.mold === "emboss"}
                        onClick={() => store.updateObject(selected.id, { mold: "emboss" })}
                      />
                    </div>
                  </>
                )}
                {selected.type === "image" && selected.stickerKind === "paper" && (
                  <div className="space-y-2 border-t border-hairline pt-2">
                    <Slider
                      label="Hue"
                      min={-180}
                      max={180}
                      value={selected.hue ?? 0}
                      onChange={(v) => store.updateObject(selected.id, { hue: v }, false)}
                    />
                    <Field label="Paper color">
                      <input
                        type="color"
                        className="h-8 w-full border border-hairline bg-background"
                        value={selected.tintColor ?? "#d9b86c"}
                        onChange={(e) =>
                          store.updateObject(selected.id, { tintColor: e.target.value, tintMode: "solid" }, false)
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-3 gap-1" aria-label="Paper color style">
                      {(["original", "solid", "gradient"] as const).map((style) => (
                        <Btn
                          key={style}
                          label={style}
                          active={(selected.tintMode ?? "original") === style}
                          onClick={() => store.updateObject(selected.id, { tintMode: style })}
                        />
                      ))}
                    </div>
                    {(selected.tintMode ?? "original") === "gradient" && (
                      <>
                        <Field label="Second color">
                          <input
                            type="color"
                            className="h-8 w-full border border-hairline bg-background"
                            value={selected.gradientColor ?? "#e7e0cc"}
                            onChange={(e) => store.updateObject(selected.id, { gradientColor: e.target.value }, false)}
                          />
                        </Field>
                        <Slider
                          label="Gradient angle"
                          min={0}
                          max={360}
                          value={selected.gradientAngle ?? 90}
                          onChange={(v) => store.updateObject(selected.id, { gradientAngle: v }, false)}
                        />
                      </>
                    )}
                  </div>
                )}
                {selected.mold && (
                  <div className="space-y-2 border-t border-hairline pt-2">
                    {selected.type === "image" && (
                      <div className="grid grid-cols-2 gap-1">
                        <Btn
                          icon="mold"
                          label="Deboss"
                          active={selected.mold === "deboss"}
                          onClick={() => store.updateObject(selected.id, { mold: "deboss" })}
                        />
                        <Btn
                          icon="mold"
                          label="Emboss"
                          active={selected.mold === "emboss"}
                          onClick={() => store.updateObject(selected.id, { mold: "emboss" })}
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1">
                      {(["shell", "clear", "custom"] as const).map((f) => (
                        <Btn
                          key={f}
                          label={f}
                          active={(selected.moldFill ?? "shell") === f}
                          onClick={() => store.updateObject(selected.id, { moldFill: f })}
                        />
                      ))}
                    </div>
                    {(selected.moldFill ?? "shell") === "custom" && (
                      <Field label="Mold tint">
                        <input
                          type="color"
                          className="h-8 w-full border border-hairline bg-background"
                          value={selected.moldColor ?? "#8a8f98"}
                          onChange={(e) => store.updateObject(selected.id, { moldColor: e.target.value }, false)}
                        />
                      </Field>
                    )}
                    <Slider
                      label="Depth"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selected.moldDepth ?? 0.5}
                      onChange={(v) => store.updateObject(selected.id, { moldDepth: v }, false)}
                    />
                  </div>
                )}
                {selected.type === "image" && !selected.mold && (

                  <div className="space-y-2 border-t border-hairline pt-2">
                    <Field label="Sticker text">
                      <input
                        className={inputClass}
                        placeholder="Type on the sticker"
                        value={selected.labelText ?? ""}
                        onChange={(e) => store.updateObject(selected.id, { labelText: e.target.value })}
                      />
                    </Field>
                    {selected.labelText ? (
                      <>
                        <Field label="Text font">
                          <select
                            className={inputClass}
                            value={selected.labelFontFamily ?? ""}
                            onChange={(e) => store.updateObject(selected.id, { labelFontFamily: e.target.value })}
                          >
                            <option value="">Default</option>
                            {store.fonts.map((f) => (
                              <option key={f.id} value={f.family}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Slider
                          label="Text size"
                          min={0.06}
                          max={0.5}
                          step={0.01}
                          value={selected.labelSize ?? 0.22}
                          onChange={(v) => store.updateObject(selected.id, { labelSize: v }, false)}
                        />
                        <Field label="Text color">
                          <input
                            type="color"
                            className="h-8 w-full border border-hairline bg-background"
                            value={selected.labelColor ?? "#1a1a1a"}
                            onChange={(e) => store.updateObject(selected.id, { labelColor: e.target.value }, false)}
                          />
                        </Field>
                      </>
                    ) : null}
                    <div className="grid grid-cols-2 gap-1">
                      <Btn icon="image" label="Add image" onClick={() => stampRef.current?.click()} />
                      <Btn
                        icon="delete"
                        label="Clear image"
                        disabled={!selected.labelImage}
                        onClick={() => store.updateObject(selected.id, { labelImage: "" })}
                      />
                    </div>
                    {selected.labelImage && (
                      <Slider
                        label="Image size"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selected.labelImageScale ?? 0.5}
                        onChange={(v) => store.updateObject(selected.id, { labelImageScale: v }, false)}
                      />
                    )}
                  </div>
                )}
                <Slider
                  label="Rotation"
                  min={-180}
                  max={180}
                  value={selected.rot}
                  onChange={(v) => store.updateObject(selected.id, { rot: v }, false)}
                />
                <Slider
                  label="Opacity"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={selected.opacity}
                  onChange={(v) => store.updateObject(selected.id, { opacity: v }, false)}
                />
              </section>
            )}

            <section className="space-y-2 border border-hairline p-3">
              <span className="label-caps text-muted-foreground">Layers</span>
              <ul className="space-y-1">
                {[...design[side]].reverse().map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => store.select(o.id)}
                      className={cn(
                        "flex w-full items-center gap-2 border border-hairline px-2 py-1.5",
                        o.id === selectedId && "border-foreground",
                      )}
                    >
                      <Icon name={o.type === "text" ? "text" : "image"} />
                      <span className="label-caps truncate">{o.type === "text" ? o.text : "image"}</span>
                    </button>
                  </li>
                ))}
                {design[side].length === 0 && <li className="label-caps text-muted-foreground">Empty</li>}
              </ul>
            </section>

          </div>
        )}

        {mode === "view" && (
          <div className="flex h-full flex-col">
            <div className="min-h-[300px] flex-1">
              <FloppyViewer
                design={design}
                lockX={lockX}
                lockY={lockY}
                onAction={(l) => {
                  if (l.url) window.open(l.url, "_blank", "noopener");
                  else if (l.icon === "share") void share();
                  else if (l.icon === "download") void download();
                  else void store.saveDesign().then(() => setToast("Saved"));
                }}
              />
            </div>
            <div className="max-h-[50svh] space-y-1.5 overflow-y-auto border-t border-hairline p-2">
              <Drawer title="Motion" open={drawer === "motion"} onToggle={() => toggleDrawer("motion")}>
                <div className="grid grid-cols-4 gap-1">
                  <Btn icon="lock" label="Lock X" active={lockX} onClick={() => setLockX((v) => !v)} />
                  <Btn icon="lock" label="Lock Y" active={lockY} onClick={() => setLockY((v) => !v)} />
                  <Btn
                    icon={design.autoRotate ? "pause" : "play"}
                    label="Spin"
                    active={design.autoRotate}
                    onClick={() => store.patch((d) => void (d.autoRotate = !d.autoRotate))}
                  />
                  <Btn icon="link" label="Menu" onClick={() => setPanel("links")} />
                </div>
                <Slider label="Speed" min={0} max={3} step={0.1} value={design.autoRotateSpeed}
                  onChange={(v) => store.patch((d) => void (d.autoRotateSpeed = v))} />
              </Drawer>

              {isCd(design) ? (
                <>
                  <Drawer title="Disc front" open={drawer === "cdfront"} onToggle={() => toggleDrawer("cdfront")}>
                    <ColorRow label="Print color" value={design.cdFrontColor ?? "#e8e8e8"}
                      onChange={(v) => store.patch((d) => { d.cdFrontColor = v; if (!d.cdFrontOpacity) d.cdFrontOpacity = 1; })} />
                    <Slider label="Solid ↔ clear" min={0} max={1} step={0.05} value={design.cdFrontOpacity ?? 0}
                      onChange={(v) => store.patch((d) => void (d.cdFrontOpacity = v))} />
                    <Slider label="Metallic" min={0} max={1} step={0.01} value={design.cdFrontMetalness ?? 0}
                      onChange={(v) => store.patch((d) => void (d.cdFrontMetalness = v))} />
                    <Slider label="Gloss" min={0} max={1} step={0.01} value={1 - (design.cdFrontRoughness ?? 0.35)}
                      onChange={(v) => store.patch((d) => void (d.cdFrontRoughness = 1 - v))} />
                  </Drawer>
                  <Drawer title="Disc back" open={drawer === "cdback"} onToggle={() => toggleDrawer("cdback")}>
                    <div className="grid grid-cols-4 gap-1">
                      {(Object.keys(CD_BACKS) as CdBackStyle[]).map((k) => (
                        <Btn key={k} label={CD_BACKS[k].label} active={(design.cdBackStyle ?? "silver") === k}
                          onClick={() => store.patch((d) => void (d.cdBackStyle = k))} />
                      ))}
                    </div>
                    <ColorRow label="Reflective color" value={cdBackColor(design)}
                      onChange={(v) => store.patch((d) => { d.cdBackStyle = "custom"; d.cdBackColor = v; })} />
                  </Drawer>
                </>
              ) : (
                <>
                  <Drawer title="Shell" open={drawer === "shell"} onToggle={() => toggleDrawer("shell")}>
                    <ColorRow label="Color" value={design.color} onChange={(v) => store.patch((d) => void (d.color = v))} />
                    <Slider label="Transparency" min={0.1} max={1} step={0.05} value={design.opacity}
                      onChange={(v) => store.patch((d) => void (d.opacity = v))} />
                    <Slider label="Reflectiveness" min={0} max={1} step={0.01} value={design.metalness ?? 0}
                      onChange={(v) => store.patch((d) => void (d.metalness = v))} />
                    <Slider label="Frost" min={0} max={0.6} step={0.01} value={design.roughness}
                      onChange={(v) => store.patch((d) => void (d.roughness = v))} />
                  </Drawer>
                  <Drawer title="Metal parts" open={drawer === "metal"} onToggle={() => toggleDrawer("metal")}>
                    <ColorRow label="Color" value={design.shutterColor ?? "#d7dce0"}
                      onChange={(v) => store.patch((d) => void (d.shutterColor = v))} />
                    <Slider label="Solid ↔ metallic" min={0} max={1} step={0.01} value={design.shutterMetalness ?? 1}
                      onChange={(v) => store.patch((d) => void (d.shutterMetalness = v))} />
                    <Slider label="Polish" min={0} max={1} step={0.01} value={1 - (design.shutterRoughness ?? 0.18)}
                      onChange={(v) => store.patch((d) => void (d.shutterRoughness = 1 - v))} />
                  </Drawer>
                </>
              )}

              <Drawer title="Foil stickers" open={drawer === "foil"} onToggle={() => toggleDrawer("foil")}>
                <div className="grid grid-cols-4 gap-1" aria-label="Foil facets">
                  {(["none", "triangles", "squares", "stripes"] as const).map((o) => (
                    <Btn key={o} label={o === "none" ? "smooth" : o} active={(design.holoOverlay ?? "triangles") === o}
                      onClick={() => store.patch((d) => void (d.holoOverlay = o))} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1" aria-label="Foil flow">
                  {(["linear", "radial", "patches"] as const).map((p) => (
                    <Btn key={p} label={p} active={(design.holoPattern ?? "linear") === p}
                      onClick={() => store.patch((d) => void (d.holoPattern = p))} />
                  ))}
                </div>
                <Slider label="Shine" min={0} max={1} step={0.05} value={design.holoIntensity ?? 0.85}
                  onChange={(v) => store.patch((d) => void (d.holoIntensity = v))} />
                <Slider label="Rainbow bands" min={1} max={20} step={1} value={design.holoBands ?? 10}
                  onChange={(v) => store.patch((d) => void (d.holoBands = v))} />
                <Slider label="Sparkle" min={0} max={1} step={0.05} value={design.holoGrain ?? 0.25}
                  onChange={(v) => store.patch((d) => void (d.holoGrain = v))} />
              </Drawer>

              <Drawer title="Background" open={drawer === "bg"} onToggle={() => toggleDrawer("bg")}>
                <div className="grid grid-cols-2 gap-1">
                  <Btn icon="image" label="Upload" onClick={() => bgRef.current?.click()} />
                  <Btn icon="delete" label="Remove" disabled={!design.bgImage}
                    onClick={() => store.patch((d) => void delete d.bgImage)} />
                </div>
                <input ref={bgRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => store.patch((d) => void (d.bgImage = String(r.result)));
                    r.readAsDataURL(f);
                    e.target.value = "";
                  }} />
              </Drawer>
            </div>
          </div>
        )}

        {mode === "align" && (
          <div className="flex h-full flex-col">
            <div className="min-h-[45svh] flex-1">
              <FloppyViewer design={design} lockX lockY />
            </div>
            <div className="space-y-2 border-t border-hairline p-3">
              <div className="grid grid-cols-2 gap-1">
                <Btn icon="align" label="Auto align" onClick={() => store.setAlignment(defaultAlignment)} />
                <Btn icon="model" label="Model" onClick={() => setPanel("models")} />
              </div>
              <Slider
                label="Rotate X"
                min={-180}
                max={180}
                value={design.alignment.rotX}
                onChange={(v) => store.setAlignment({ rotX: v })}
              />
              <Slider
                label="Rotate Y"
                min={-180}
                max={180}
                value={design.alignment.rotY}
                onChange={(v) => store.setAlignment({ rotY: v })}
              />
              <Slider
                label="Rotate Z"
                min={-180}
                max={180}
                value={design.alignment.rotZ}
                onChange={(v) => store.setAlignment({ rotZ: v })}
              />
              <Slider
                label="Scale"
                min={0.5}
                max={1.6}
                step={0.01}
                value={design.alignment.scale}
                onChange={(v) => store.setAlignment({ scale: v })}
              />
              <Slider
                label="Offset X"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={design.alignment.offsetX}
                onChange={(v) => store.setAlignment({ offsetX: v })}
              />
              <Slider
                label="Offset Y"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={design.alignment.offsetY}
                onChange={(v) => store.setAlignment({ offsetY: v })}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="grid grid-cols-4 gap-1 border-t border-hairline p-2">
        <Btn icon="save" label="Save" onClick={() => void store.saveDesign().then(() => setToast("Saved"))} />
        <Btn icon="designs" label="Files" onClick={() => setPanel("designs")} />
        <Btn icon="share" label="Share" onClick={() => void share()} />
        <Btn icon="download" label="PNG" onClick={() => void download()} />
      </footer>

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 border border-hairline bg-background px-3 py-2 label-caps">
          {toast}
        </div>
      )}

      <ImageImporter open={panel === "import"} onClose={() => setPanel(null)} />
      <MoldImporter open={panel === "mold"} onClose={() => setPanel(null)} />

      <StickerGallery open={panel === "holo"} onClose={() => setPanel(null)} kind="holo" />
      <StickerGallery open={panel === "paper"} onClose={() => setPanel(null)} kind="paper" />
      <FontGallery open={panel === "fonts"} onClose={() => setPanel(null)} />
      <DesignGallery open={panel === "designs"} onClose={() => setPanel(null)} />
      <ModelGallery open={panel === "models"} onClose={() => setPanel(null)} />

      <Modal open={panel === "links"} onClose={() => setPanel(null)} title="Menu">
        <div className="space-y-3">
          {design.links.map((l, i) => (
            <div key={l.id} className="space-y-1 border border-hairline p-2">
              <Field label="Label">
                <input
                  className={inputClass}
                  value={l.label}
                  onChange={(e) =>
                    store.patch((d) => {
                      d.links[i]!.label = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="Link (optional)">
                <input
                  className={inputClass}
                  placeholder="https://"
                  value={l.url}
                  onChange={(e) =>
                    store.patch((d) => {
                      d.links[i]!.url = e.target.value;
                    })
                  }
                />
              </Field>
              <Btn
                icon="delete"
                label="Remove"
                className="w-full"
                onClick={() =>
                  store.commit((d) => {
                    d.links = d.links.filter((x) => x.id !== l.id);
                  })
                }
              />
            </div>
          ))}
          <Btn
            icon="add"
            label="Add action"
            className="w-full"
            onClick={() =>
              store.commit((d) => {
                d.links.push({ id: Math.random().toString(36).slice(2, 10), label: "Open", icon: "link", url: "" });
              })
            }
          />
        </div>
      </Modal>

      <input
        ref={stampRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = selectedId;
          e.target.value = "";
          if (!file || !id) return;
          const reader = new FileReader();
          reader.onload = () => store.updateObject(id, { labelImage: String(reader.result) });
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} value={value}
          className="h-9 w-14 shrink-0 cursor-pointer border border-hairline bg-background"
          onChange={(e) => onChange(e.target.value)} />
        <input aria-label={`${label} hex`} key={value} className={inputClass} defaultValue={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
          }} />
      </div>
    </Field>
  );
}
