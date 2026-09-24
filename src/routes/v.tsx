import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FloppyViewer } from "@/components/FloppyViewer";
import { Icon } from "@/components/ui/Icon";
import { decodeDesign } from "@/lib/share";
import { renderLabel } from "@/lib/labelCanvas";
import { useTheme } from "@/lib/useTheme";
import { registerFont, useStudio } from "@/lib/store";
import type { Design } from "@/lib/types";

export const Route = createFileRoute("/v")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Shared Disk — Floppy Studio" },
      { name: "description", content: "View a shared translucent 3.5-inch floppy disk design in interactive 3D." },
      { property: "og:title", content: "Shared Disk — Floppy Studio" },
      { property: "og:description", content: "View a shared floppy disk design in interactive 3D." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedViewer,
});

function SharedViewer() {
  const [design, setDesign] = useState<Design | null>(null);
  const [error, setError] = useState(false);
  const { theme, toggle } = useTheme();
  const saveDesign = useStudio((s) => s.saveDesign);
  const setStoreDesign = useStudio((s) => s.setDesign);

  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!code) {
      setError(true);
      return;
    }
    void decodeDesign(code).then((d) => {
      if (!d) return setError(true);
      for (const f of useStudio.getState().fonts) void registerFont(f);
      setDesign(d);
    });
  }, []);

  if (error)
    return (
      <div className="flex h-[100svh] items-center justify-center bg-background label-caps text-muted-foreground">
        Invalid link
      </div>
    );

  if (!design)
    return (
      <div className="flex h-[100svh] items-center justify-center bg-background label-caps text-muted-foreground">
        Loading
      </div>
    );

  return (
    <div className="flex h-[100svh] flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="label-caps truncate">{design.name}</span>
        <button type="button" onClick={toggle} aria-label="Theme">
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </header>
      <div className="flex-1">
        <FloppyViewer
          design={design}
          onAction={async (l) => {
            if (l.url) {
              window.open(l.url, "_blank", "noopener");
              return;
            }
            if (l.icon === "download") {
              const canvas = await renderLabel(design.front, 2048);
              const a = document.createElement("a");
              a.download = `${design.name}.png`;
              a.href = canvas.toDataURL("image/png");
              a.click();
            } else if (l.icon === "share") {
              const url = window.location.href;
              if (navigator.share) await navigator.share({ title: design.name, url }).catch(() => undefined);
              else await navigator.clipboard.writeText(url);
            } else {
              setStoreDesign(design);
              await saveDesign();
            }
          }}
        />
      </div>
    </div>
  );
}
