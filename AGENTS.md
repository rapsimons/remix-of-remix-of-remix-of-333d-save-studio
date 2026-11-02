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
- Liquid glass composites a depth-masked sharp solid pass over a separate warped background pass; keep solid media out of refraction and use geometric normals for edge-only spectral highlights.
- Share the procedural plastic normal map and neutral softbox rig between cartridge scenes so material detail and bevel lighting stay consistent without altering native CD fronts.
- Keep liquid-glass solid buffers at canvas DPR and reduce only background buffers, so internal disc details stay sharp.
- MiniDisc clear hub rings and outer rims use separate transparent PBR annuli, so ring sizing changes real clear geometry rather than just optical coloration.
- Share directional brushed normals and PBR thin-film settings through metalSurface for shutter and hub finishes, keeping metal independent of case glass.
- Prepare private MiniDisc CAD metal geometry once per loaded model with planar UVs while preserving source normals and winding; draw the shutter above the coplanar shell to avoid depth conflicts without changing its surface orientation.
- Illuminate both hemispheres in the shared cartridge softbox rig and give MiniDisc a rear directional light, because fully metallic rear faces need specular illumination rather than ambient fill.
