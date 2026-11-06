import { create } from "zustand";
import { idb } from "./idb";
import { migrateAlignments, updateAlignment } from "./modelAlignment";
import { createDesign, uid, type Design, type LabelObject, type Side, type MenuLink, type Alignment } from "./types";
import holoValid from "@/assets/holo-valid.png.asset.json";
import holoCubes from "@/assets/holo-cubes.png.asset.json";
import paperOval from "@/assets/paper-oval.png.asset.json";
import paperStar from "@/assets/paper-starburst.png.asset.json";
import paperSquare from "@/assets/paper-square.png.asset.json";
import paperCapsule from "@/assets/paper-capsule.png.asset.json";
import floppyLabel from "@/assets/paper-floppy-label.svg";
import floppyGlb from "@/assets/floppy.glb.asset.json";

export const DEFAULT_MODEL_URL = floppyGlb.url;

export type GalleryItem = { id: string; name: string; src: string; builtin?: boolean };
export type FontItem = { id: string; name: string; family: string; src: string };
export type ModelItem = { id: string; name: string; src: string; builtin?: boolean };

const builtinHolo: GalleryItem[] = [
  { id: "holo-valid", name: "Valid", src: holoValid.url, builtin: true },
  { id: "holo-cubes", name: "Cubes", src: holoCubes.url, builtin: true },
];
const cdCaseStickers = import.meta.glob<{ url: string }>("@/assets/cdcase-[0-9]*.png.asset.json", { eager: true, import: "default" });
const builtinCdCase: GalleryItem[] = Object.keys(cdCaseStickers).sort().map((k, i) => ({
  id: `cdcase-${String(i + 1).padStart(2, "0")}`,
  name: `Disc ${i + 1}`,
  src: cdCaseStickers[k]?.url ?? "",
  builtin: true,
}));
const builtinPaper: GalleryItem[] = [
  { id: "paper-square", name: "Square", src: paperSquare.url, builtin: true },
  { id: "paper-oval", name: "Oval", src: paperOval.url, builtin: true },
  { id: "paper-capsule", name: "Capsule", src: paperCapsule.url, builtin: true },
  { id: "paper-star", name: "Starburst", src: paperStar.url, builtin: true },
  { id: "paper-floppy-label", name: "Floppy label", src: floppyLabel, builtin: true },
  ...builtinCdCase,
];

type State = {
  design: Design;
  side: Side;
  selectedId: string | null;
  past: Design[];
  future: Design[];
  holo: GalleryItem[];
  paper: GalleryItem[];
  fonts: FontItem[];
  models: ModelItem[];
  saved: Design[];
  ready: boolean;
};

type Actions = {
  init: () => Promise<void>;
  commit: (mutator: (d: Design) => void) => void;
  setDesign: (d: Design) => void;
  patch: (mutator: (d: Design) => void) => void; // no history (live drags)
  undo: () => void;
  redo: () => void;
  setSide: (s: Side) => void;
  select: (id: string | null) => void;
  addObject: (o: Omit<LabelObject, "id">) => void;
  updateObject: (id: string, patch: Partial<LabelObject>, history?: boolean) => void;
  removeObject: (id: string) => void;
  raiseObject: (id: string, dir: 1 | -1) => void;
  setLinks: (links: MenuLink[]) => void;
  setAlignment: (a: Partial<Alignment>) => void;
  addGalleryItem: (kind: "holo" | "paper", item: GalleryItem) => Promise<void>;
  removeGalleryItem: (kind: "holo" | "paper", id: string) => Promise<void>;
  addFont: (f: FontItem) => Promise<void>;
  removeFont: (id: string) => Promise<void>;
  addModel: (m: ModelItem) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  saveDesign: () => Promise<void>;
  duplicateDesign: () => Promise<void>;
  loadDesign: (id: string) => void;
  deleteDesign: (id: string) => Promise<void>;
  newDesign: () => void;
};

const clone = (d: Design): Design => JSON.parse(JSON.stringify(d)) as Design;

export const useStudio = create<State & Actions>((set, get) => ({
  design: migrateAlignments(createDesign()),
  side: "front",
  selectedId: null,
  past: [],
  future: [],
  holo: builtinHolo,
  paper: builtinPaper,
  fonts: [],
  models: [{ id: "builtin", name: "3.5\u2033 HD Floppy", src: DEFAULT_MODEL_URL, builtin: true }],
  saved: [],
  ready: false,

  async init() {
    if (get().ready) return;
    // ask the browser not to evict our saved uploads
    void navigator.storage?.persist?.().catch(() => undefined);
    const [holo, paper, fonts, models, saved, session] = await Promise.all([
      idb.all<GalleryItem>("holo"),
      idb.all<GalleryItem>("paper"),
      idb.all<FontItem>("fonts"),
      idb.all<ModelItem>("models"),
      idb.all<Design>("designs"),
      idb.all<{ id: string; design: Design }>("session"),
    ]);
    await Promise.all(fonts.map((f) => registerFont(f)));
    const current = session.find((s) => s.id === "current")?.design;
    set({
      holo: [...builtinHolo, ...holo],
      paper: [...builtinPaper, ...paper],
      fonts,
      models: [{ id: "builtin", name: "3.5\u2033 HD Floppy", src: DEFAULT_MODEL_URL, builtin: true }, ...models],
      saved: saved.map(migrateAlignments).sort((a, b) => b.updatedAt - a.updatedAt),
      ...(current ? { design: migrateAlignments(current) } : {}),
      ready: true,
    });
    // keep the working disc saved so a reload restores it
    let timer: ReturnType<typeof setTimeout> | undefined;
    useStudio.subscribe((s, prev) => {
      if (s.design === prev.design) return;
      clearTimeout(timer);
      timer = setTimeout(() => void idb.put("session", { id: "current", design: s.design }), 400);
    });
  },

  commit(mutator) {
    const { design, past } = get();
    const next = clone(design);
    mutator(next);
    next.updatedAt = Date.now();
    set({ design: next, past: [...past.slice(-40), design], future: [] });
  },

  patch(mutator) {
    const next = clone(get().design);
    mutator(next);
    set({ design: next });
  },

  setDesign(d) {
    set({ design: migrateAlignments(d), past: [], future: [], selectedId: null });
  },

  undo() {
    const { past, future, design } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ design: prev, past: past.slice(0, -1), future: [design, ...future].slice(0, 40), selectedId: null });
  },

  redo() {
    const { past, future, design } = get();
    const next = future[0];
    if (!next) return;
    set({ design: next, future: future.slice(1), past: [...past, design], selectedId: null });
  },

  setSide(s) {
    set({ side: s, selectedId: null });
  },
  select(id) {
    set({ selectedId: id });
  },

  addObject(o) {
    const id = uid();
    const side = get().side;
    get().commit((d) => {
      (d[side] ??= []).push({ ...o, id } as LabelObject);
    });
    set({ selectedId: id });
  },

  updateObject(id, patchObj, history = true) {
    const side = get().side;
    const fn = (d: Design) => {
      const obj = (d[side] ?? []).find((o) => o.id === id);
      if (obj) Object.assign(obj, patchObj);
    };
    history ? get().commit(fn) : get().patch(fn);
  },

  removeObject(id) {
    const side = get().side;
    get().commit((d) => {
      d[side] = (d[side] ?? []).filter((o) => o.id !== id);
    });
    set({ selectedId: null });
  },

  raiseObject(id, dir) {
    const side = get().side;
    get().commit((d) => {
      const list: LabelObject[] = d[side] ?? (d[side] = []);
      const i = list.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const a = list[i]!;
      const b = list[j]!;
      list[i] = b;
      list[j] = a;
    });
  },

  setLinks(links) {
    get().commit((d) => {
      d.links = links;
    });
  },

  setAlignment(a) {
    get().commit((d) => {
      updateAlignment(d, a);
    });
  },

  async addGalleryItem(kind, item) {
    await idb.put(kind, item);
    set((s) => ({ [kind]: [...s[kind], item] }) as Partial<State>);
  },
  async removeGalleryItem(kind, id) {
    await idb.del(kind, id);
    set((s) => ({ [kind]: s[kind].filter((i) => i.id !== id) }) as Partial<State>);
  },

  async addFont(f) {
    await idb.put("fonts", f);
    await registerFont(f);
    set((s) => ({ fonts: [...s.fonts, f] }));
  },
  async removeFont(id) {
    await idb.del("fonts", id);
    set((s) => ({ fonts: s.fonts.filter((f) => f.id !== id) }));
  },

  async addModel(m) {
    await idb.put("models", m);
    set((s) => ({ models: [...s.models, m] }));
  },
  async removeModel(id) {
    await idb.del("models", id);
    set((s) => ({ models: s.models.filter((m) => m.id !== id) }));
  },

  async saveDesign() {
    const d = clone(get().design);
    d.updatedAt = Date.now();
    await idb.put("designs", d);
    set((s) => ({ design: d, saved: [d, ...s.saved.filter((x) => x.id !== d.id)] }));
  },

  async duplicateDesign() {
    const d = clone(get().design);
    d.id = uid();
    d.name = `${d.name} copy`;
    d.updatedAt = Date.now();
    await idb.put("designs", d);
    set((s) => ({ design: d, saved: [d, ...s.saved], past: [], future: [] }));
  },

  loadDesign(id) {
    const d = get().saved.find((s) => s.id === id);
    if (d) set({ design: migrateAlignments(clone(d)), past: [], future: [], selectedId: null });
  },

  async deleteDesign(id) {
    await idb.del("designs", id);
    set((s) => ({ saved: s.saved.filter((d) => d.id !== id) }));
  },

  newDesign() {
    set({ design: migrateAlignments(createDesign()), past: [], future: [], selectedId: null });
  },
}));

export async function registerFont(f: FontItem) {
  if (typeof document === "undefined") return;
  try {
    const face = new FontFace(f.family, `url(${f.src})`);
    await face.load();
    (document.fonts as FontFaceSet).add(face);
  } catch {
    /* ignore */
  }
}
