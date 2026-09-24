import { useRef } from "react";
import { Modal, Btn } from "./ui/kit";
import { Icon } from "./ui/Icon";
import { useStudio } from "@/lib/store";
import { uid } from "@/lib/types";

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export function StickerGallery({
  open,
  onClose,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  kind: "holo" | "paper";
}) {
  const items = useStudio((s) => (kind === "holo" ? s.holo : s.paper));
  const addGalleryItem = useStudio((s) => s.addGalleryItem);
  const removeGalleryItem = useStudio((s) => s.removeGalleryItem);
  const addObject = useStudio((s) => s.addObject);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Modal open={open} onClose={onClose} title={kind === "holo" ? "Holographic" : "Paper"}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          await addGalleryItem(kind, { id: uid(), name: f.name.replace(/\.\w+$/, ""), src: await readAsDataUrl(f) });
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.id} className="relative border border-hairline p-1">
            <button
              type="button"
              className="block w-full"
              onClick={async () => {
                const img = new Image();
                img.src = it.src;
                await img.decode().catch(() => undefined);
                addObject({
                  type: "image",
                  x: 0.5,
                  y: 0.5,
                  w: 0.4,
                  aspect: img.width && img.height ? img.width / img.height : 1,
                  rot: 0,
                  opacity: 1,
                  src: it.src,
                });
                onClose();
              }}
            >
              <img src={it.src} alt={it.name} className="aspect-square w-full object-contain" />
            </button>
            {!it.builtin && (
              <button
                type="button"
                aria-label="Delete"
                onClick={() => void removeGalleryItem(kind, it.id)}
                className="absolute right-0 top-0 bg-background p-1"
              >
                <Icon name="delete" className="size-3" />
              </button>
            )}
          </div>
        ))}
        <Btn icon="add" label="Add" className="aspect-square" onClick={() => fileRef.current?.click()} />
      </div>
    </Modal>
  );
}

export function FontGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fonts = useStudio((s) => s.fonts);
  const addFont = useStudio((s) => s.addFont);
  const removeFont = useStudio((s) => s.removeFont);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Modal open={open} onClose={onClose} title="Fonts">
      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const name = f.name.replace(/\.\w+$/, "");
          await addFont({ id: uid(), name, family: `custom-${name}`.replace(/\s+/g, "-"), src: await readAsDataUrl(f) });
          e.target.value = "";
        }}
      />
      <ul className="space-y-1">
        {fonts.map((f) => (
          <li key={f.id} className="flex items-center justify-between border-b border-hairline py-2">
            <span style={{ fontFamily: `"${f.family}", monospace` }} className="text-sm">
              {f.name}
            </span>
            <button type="button" aria-label="Delete" onClick={() => void removeFont(f.id)}>
              <Icon name="delete" />
            </button>
          </li>
        ))}
        {fonts.length === 0 && <li className="label-caps py-4 text-muted-foreground">No fonts yet</li>}
      </ul>
      <Btn icon="add" label="Add font" className="mt-3 w-full" onClick={() => fileRef.current?.click()} />
    </Modal>
  );
}

export function DesignGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useStudio((s) => s.saved);
  const loadDesign = useStudio((s) => s.loadDesign);
  const deleteDesign = useStudio((s) => s.deleteDesign);
  const newDesign = useStudio((s) => s.newDesign);
  const duplicateDesign = useStudio((s) => s.duplicateDesign);

  return (
    <Modal open={open} onClose={onClose} title="Designs">
      <ul className="space-y-1">
        {saved.map((d) => (
          <li key={d.id} className="flex items-center justify-between border-b border-hairline py-2">
            <button
              type="button"
              className="text-left text-sm"
              onClick={() => {
                loadDesign(d.id);
                onClose();
              }}
            >
              {d.name}
              <span className="label-caps ml-2 text-muted-foreground">
                {new Date(d.updatedAt).toLocaleDateString()}
              </span>
            </button>
            <button type="button" aria-label="Delete" onClick={() => void deleteDesign(d.id)}>
              <Icon name="delete" />
            </button>
          </li>
        ))}
        {saved.length === 0 && <li className="label-caps py-4 text-muted-foreground">Nothing saved yet</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <Btn
          icon="add"
          label="New"
          className="flex-1"
          onClick={() => {
            newDesign();
            onClose();
          }}
        />
        <Btn
          icon="copy"
          label="Duplicate"
          className="flex-1"
          onClick={() => {
            void duplicateDesign();
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

export function ModelGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const models = useStudio((s) => s.models);
  const addModel = useStudio((s) => s.addModel);
  const removeModel = useStudio((s) => s.removeModel);
  const design = useStudio((s) => s.design);
  const commit = useStudio((s) => s.commit);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Modal open={open} onClose={onClose} title="Models">
      <input
        ref={fileRef}
        type="file"
        accept=".glb,.gltf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          await addModel({ id: uid(), name: f.name.replace(/\.\w+$/, ""), src: await readAsDataUrl(f) });
          e.target.value = "";
        }}
      />
      <ul className="space-y-1">
        {models.map((m) => {
          const active = (design.modelUrl ?? models[0]?.src) === m.src;
          return (
            <li key={m.id} className="flex items-center justify-between border-b border-hairline py-2">
              <button
                type="button"
                className="flex items-center gap-2 text-left text-sm"
                onClick={() => {
                  commit((d) => {
                    d.modelUrl = m.src;
                  });
                  onClose();
                }}
              >
                <Icon name={active ? "check" : "model"} />
                {m.name}
              </button>
              {!m.builtin && (
                <button type="button" aria-label="Delete" onClick={() => void removeModel(m.id)}>
                  <Icon name="delete" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Btn icon="add" label="Add model" className="mt-3 w-full" onClick={() => fileRef.current?.click()} />
    </Modal>
  );
}
