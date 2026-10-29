import { Lightformer } from "@react-three/drei";

/** Offscreen neutral reflections define moulded bevels without coloured face washes. */
export function StudioSoftboxes() {
  return <>
    <Lightformer intensity={1.4} position={[-4, 1, 3]} scale={[0.8, 8, 1]} target={[0, 0, 0]} />
    <Lightformer intensity={0.9} position={[4, 1, 2]} scale={[0.6, 7, 1]} target={[0, 0, 0]} />
    <Lightformer intensity={1.1} position={[0, 5, 1]} scale={[10, 0.8, 1]} target={[0, 0, 0]} />
    <Lightformer form="circle" intensity={0.5} position={[0, -2, 5]} scale={[6, 6, 1]} target={[0, 0, 0]} />
  </>;
}