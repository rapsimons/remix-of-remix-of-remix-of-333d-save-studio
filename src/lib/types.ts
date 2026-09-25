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
    updatedAt: Date.now(),
  };
}
