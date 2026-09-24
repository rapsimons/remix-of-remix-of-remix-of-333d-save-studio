import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/Studio";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Floppy Studio — 3.5″ Disk Mockup Generator" },
      {
        name: "description",
        content:
          "Design translucent 3.5-inch floppy disk mockups with stickers, type and holographic artwork, then share a spinnable 3D link.",
      },
      { property: "og:title", content: "Floppy Studio — 3.5″ Disk Mockup Generator" },
      {
        property: "og:description",
        content: "Build translucent floppy disk mockups and share them as interactive 3D links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});
