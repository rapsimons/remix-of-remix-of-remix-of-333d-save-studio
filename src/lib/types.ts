export type Side = "front" | "back";

export type LabelObject = {
  id: string;
  type: "text" | "image";
  /** normalized center 0..1 within label canvas */
  x: number;
  y: number;
  /** normalized width 0..1 (height derived from aspect for images) */
  w: number;
  /** aspect ratio (w/h) for images */
  aspect?: number;
  /** rotation in degrees */
  rot: number;
  opacity: number;
  // text
  text?: string;
  fontId?: string;
  fontFamily?: string;
  fontSize?: number; // normalized to canvas height
  color?: string;
  tracking?: number;
  // image
  src?: string;
  stickerKind?: "holo" | "paper";
  hue?: number;
  tintMode?: "original" | "solid" | "gradient";
  tintColor?: string;
  gradientColor?: string;
  gradientAngle?: number;
  /** text printed on top of a sticker */
  labelText?: string;
  labelColor?: string;
  labelSize?: number;
  labelFontFamily?: string;
  /** image stamped on top of a sticker */
  labelImage?: string;
  labelImageScale?: number;
  /** molded-into-the-plastic artwork (traced silhouette) */
  mold?: "deboss" | "emboss" | undefined;
  /** where the molded shape takes its colour from */
  moldFill?: "shell" | "clear" | "custom";
  moldColor?: string;
  /** 0..1 relief depth */
  moldDepth?: number;
};


export type MenuLink = {
  id: string;
  label: string;
  icon: "save" | "share" | "download" | "link";
  url: string;
};

export type Alignment = {
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type Design = {
  id: string;
  name: string;
  color: string;
  opacity: number;
  roughness: number;
  front: LabelObject[];
  back: LabelObject[];
  links: MenuLink[];
  autoRotate: boolean;
  autoRotateSpeed: number;
  alignment: Alignment;
  modelUrl?: string;
  /** holographic foil look for holo stickers */
  holoPattern?: "linear" | "radial" | "patches";
  holoOverlay?: "none" | "triangles" | "squares" | "stripes";
  holoIntensity?: number;
  holoBands?: number;
  holoGrain?: number;
  updatedAt: number;
};

export const defaultAlignment: Alignment = {
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function createDesign(): Design {
  return {
    id: uid(),
    name: "Untitled",
    color: "#2f6fd0",
    opacity: 0.55,
    roughness: 0.05,
    front: [],
    back: [],
    links: [
      { id: uid(), label: "Save", icon: "save", url: "" },
      { id: uid(), label: "Share", icon: "share", url: "" },
      { id: uid(), label: "Download", icon: "download", url: "" },
    ],
    autoRotate: true,
    autoRotateSpeed: 0.4,
    alignment: { ...defaultAlignment },
    holoPattern: "linear",
    holoOverlay: "triangles",
    holoIntensity: 0.85,
    holoBands: 10,
    holoGrain: 0.25,
    updatedAt: Date.now(),
  };
}
