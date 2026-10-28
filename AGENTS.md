<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- MiniDisc renders in its own scene (src/components/MiniDiscScene.tsx) with a parametric disc + src/lib/discShader.ts (ported cd-case DISC_FRAG); keeps GLB-based floppy/CD logic separate so changes can't break them.
- Package 3D export ZIPs with STORE compression because GLB/PNG recompression blocks the browser without useful size savings.
