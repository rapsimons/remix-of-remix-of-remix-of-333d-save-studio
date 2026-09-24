import { useState } from "react";
import { FloppyScene } from "./FloppyScene";
import { Icon, type IconName } from "./ui/Icon";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";

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

  return (
    <div className={cn("relative h-full w-full", className)}>
      <FloppyScene
        design={design}
        modelUrl={design.modelUrl}
        flat={flat}
        lockX={lockX}
        lockY={lockY}
        onDoubleTap={() => setFlat((f) => !f)}
      />
      {!flat && (
        <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center label-caps text-muted-foreground">
          Double tap
        </span>
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
    </div>
  );
}
