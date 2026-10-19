import CaseStage from "./cd-case/CaseStage";
import { DISC } from "./cd-case/disc";
import type { Design } from "@/lib/types";

type Props = {
  design: Design;
  lockX?: boolean;
  lockY?: boolean;
  allowZoom?: boolean;
  onDoubleTap?: () => void;
};

/** "Case" tab: the cd-case repo's jewel case + disc, rendered exactly as in the repo. */
export function MiniDiscScene({ design, onDoubleTap }: Props) {
  return (
    <div className="relative h-full w-full [&_.cd-stage]:absolute [&_.cd-stage]:inset-0 [&_.cd-canvas]:block [&_.cd-canvas]:h-full [&_.cd-canvas]:w-full" onDoubleClick={onDoubleTap}>
      <CaseStage disc={DISC} spin={design.autoRotate ?? true} />
    </div>
  );
}
