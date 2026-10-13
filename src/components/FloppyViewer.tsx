import { useState } from "react";
import { FloppyScene } from "./FloppyScene";
import { MiniDiscScene } from "./MiniDiscScene";
import { isMiniDisc } from "@/lib/media";
import { Icon, type IconName } from "./ui/Icon";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LightEditor } from "./LightEditor";

export function FloppyViewer({
  design,
  lockX = false,
  lockY = false,
  onAction,
  className,
}: {
  design: Design;
  lockX?: boolean;
  lockY?: boolean;
  onAction?: (link: Design["links"][number]) => void;
  className?: string;
}) {
  const [flat, setFlat] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [lighting, setLighting] = useState(false);

  return (
    <div className={cn("relative h-full w-full", className)}>
      {isMiniDisc(design) ? (
        <MiniDiscScene design={design} lockX={lockX} lockY={lockY} onDoubleTap={() => setFlat((f) => !f)} />
      ) : (
      <FloppyScene
        design={design}
        modelUrl={design.modelUrl}
        flat={flat}
        lockX={lockX}
        lockY={lockY}
        onDoubleTap={() => setFlat((f) => !f)}
      />
      )}
      {lighting && <LightEditor design={design} onDone={() => setLighting(false)} />}
      {!flat && !lighting && (
        <button
          type="button"
          aria-label="Light"
          onClick={() => setLighting(true)}
          className="label-caps absolute bottom-3 left-3 flex size-12 items-center justify-center rounded-full border border-hairline bg-background/80 text-[10px] backdrop-blur hover:bg-accent"
        >
          Light
        </button>
      )}
      {!flat && !lighting && (
        <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center label-caps text-muted-foreground">
          Double tap
        </span>
      )}
      {!flat && !lighting && (
        <button
          type="button"
          aria-label="Inspect in full screen"
          onClick={() => setImmersive(true)}
          className="absolute bottom-3 right-3 flex size-12 items-center justify-center rounded-full border border-hairline bg-background/80 backdrop-blur hover:bg-accent"
        >
          <Icon name="expand" className="size-5" />
        </button>
      )}
      {flat && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]"
          onClick={() => setFlat(false)}
        >
          <div
            className="flex min-w-[180px] flex-col border border-hairline bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            {design.links.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onAction?.(l)}
                className="flex items-center gap-3 border-b border-hairline px-4 py-3 text-left last:border-b-0 hover:bg-accent"
              >
                <Icon name={l.icon as IconName} />
                <span className="label-caps">{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {immersive && (
        <div className="fixed inset-0 z-50 touch-none bg-background">
          {isMiniDisc(design) ? (
            <MiniDiscScene design={design} allowZoom />
          ) : (
          <FloppyScene
            design={design}
            modelUrl={design.modelUrl}
            flat={false}
            lockX={false}
            lockY={false}
            allowZoom
          />
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-5 text-center label-caps text-muted-foreground">
            Drag to spin · pinch to zoom
          </span>
          <button
            type="button"
            aria-label="Exit full screen"
            onClick={() => setImmersive(false)}
            className="absolute right-4 top-4 flex size-12 items-center justify-center rounded-full border border-hairline bg-background/80 backdrop-blur hover:bg-accent"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

