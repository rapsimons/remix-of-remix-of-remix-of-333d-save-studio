export type Side = "front" | "back" | "discFront" | "discBack";

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
  /** 0 = plastic, 1 = polished metal */
  metalness?: number;
  front: LabelObject[];
  back: LabelObject[];
  /** MiniDisc inner disc artwork (round, designed in 2D Disc mode) */
  discFront: LabelObject[];
  discBack: LabelObject[];
  links: MenuLink[];
  autoRotate: boolean;
  autoRotateSpeed: number;
  alignment: Alignment;
  /** Alignment stored separately for each physical model and version. */
  modelAlignments?: Record<string, Alignment>;
  modelUrl?: string;
  /** holographic foil look for holo stickers */
  holoPattern?: "linear" | "radial" | "patches";
  holoOverlay?: "none" | "triangles" | "squares" | "stripes";
  holoIntensity?: number;
  holoBands?: number;
  holoGrain?: number;
  /** which physical media is being designed */
  mediaType?: "floppy" | "cd" | "minidisc" | "ps1";
  /** which 3D model version to show for the media type */
  modelVariant?: "v1" | "v2" | "v3";
  /** CD reflective data side */
  cdBackStyle?: "silver" | "black" | "gold" | "custom";
  cdBackColor?: string;
  lights?: SceneLight[];
  /** CD printed face (silkscreen lacquer) — opacity 0 = clear */
  cdFrontColor?: string;
  cdFrontOpacity?: number;
  cdFrontMetalness?: number;
  cdFrontRoughness?: number;
  /** floppy metal shutter / hub */
  shutterColor?: string;
  shutterMetalness?: number;
  shutterRoughness?: number;
  /** Directional brushed metal micro-grooves (0-1). */
  shutterBrushed?: number;
  /** Thin-film rainbow finish on metal parts (0-1). */
  shutterIridescence?: number;
  /** image shown behind the 3D model (data URL) */
  bgImage?: string;
  /** how strongly the background image reflects in the models (0-2) */
  reflectStrength?: number;
  /** 0 = sharp mirror, 1 = very blurred reflection */
  reflectBlur?: number;
  /** "no colour": use the model's original material instead of a tint */
  shellNone?: boolean;
  shutterNone?: boolean;
  /** Memory Card: original PlayStation print and paper label */
  mcLogo?: boolean;
  mcLabel?: boolean;
  mcLabelColor?: string;
  /** Memory Card V2 circuit board fit: width/length multipliers, offsets, chip height */
  pcbWidth?: number;
  pcbLength?: number;
  pcbX?: number;
  pcbY?: number;
  pcbChips?: number;
  pcbThickness?: number;
  /** fine moulded-plastic surface texture (0-1) */
  plasticGrain?: number;
  /** rainbow glass shimmer at edges of clear plastic (0-1) */
  glassShimmer?: number;
  /** Liquid Glass: how strongly clear plastic bends the background/inside (0-1) */
  glassRefraction?: number;
  /** Liquid Glass: rainbow fringing (0-1) */
  glassDispersion?: number;
  /** Liquid Glass: flowing wave distortion (0-1) */
  glassWaves?: number;
  /** Liquid Glass: rim highlights (0-1) */
  glassGlint?: number;
  /** MiniDisc: disc reflective tint */
  discColor?: string;
  /** MiniDisc: size of clear plastic ring around the centre hub (0-1) */
  discHubRing?: number;
  /** MiniDisc disc: centre hole size, rainbow strength, thickness, offsets */
  discHole?: number;
  discRainbow?: number;
  discThick?: number;
  discX?: number;
  discY?: number;
  discZ?: number;
  /** MiniDisc V3: which CD model sits inside, plus its fit */
  mdCdModel?: "v1" | "v2" | "v3";
  mdCdScale?: number;
  mdCdX?: number;
  mdCdY?: number;
  mdCdZ?: number;
  mdCdSpin?: number;
  /** CD jewel case plastic (separate from cartridge shell settings) */
  caseColor?: string;
  caseOpacity?: number;
  caseRoughness?: number;
  caseMetalness?: number;
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
    discFront: [],
    discBack: [],
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

export type SceneLight = { id: string; x: number; y: number; color: string; intensity: number };
