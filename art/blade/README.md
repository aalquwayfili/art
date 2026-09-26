# Blade

[![preview](preview.webp)](https://aalquwayfili.com/art/blade/)

A sword hangs above the floor of a dark studio and turns once while the camera moves in close and back out. The blade is folded steel with a fuller down the middle. The guard and pommel are engraved brass, and the grip is wound with leather cord. It is an original design, not a copy of any historical or game sword.

[View it live](https://aalquwayfili.com/art/blade/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **The sword** is a signed distance field, drawn by sphere tracing ([Hart 1996](https://doi.org/10.1007/s003710050084)) inside its bounding box, one fragment pass for the whole image. The blade's cross-section is cut from planes: slightly convex faces, an edge bevel, a honed micro-bevel at the edge and a round fuller, all tapering to an ogival point. The guard is a chamfered bar with faceted end knobs and a centre block. The pommel is an octagonal wheel with a boss, and the grip is an oval core with one cord wound as a helix, about 24 turns.
- **The folded steel** is a layer count: warped value noise ([domain warping](https://iquilezles.org/articles/warp/)) stretched along the blade, plus the depth into the steel. On the faces you see the warp as flowing contours. Where the bevels and the fuller grind down through the layers, the lines crowd together along the edge. Bright layers are polished and dark layers are etched matte. The contrast fades where the lines get finer than a pixel.
- **Metal** reflects five procedural softboxes through Ward's anisotropic BRDF ([Ward 1992](https://doi.org/10.1145/142920.134078)), importance sampled as in [Walter 2005](https://www.graphics.cornell.edu/~bjw/wardnotes.pdf). The faces are polished along the blade, the bevels are ground across it, and faint hairline scratches make the finish rougher where they cross. The faces are slightly convex, so the tall strip light slides across them as the sword turns.
- **Engraving** is cut into the distance field as a running vine scroll with spiral curls, a border on the guard block and a ring and rays on the pommel. The recesses darken with patina, driven by the engraving and by ambient occlusion sampled along the normal.
- **Shadows.** The leather and the floor take soft shadows from the key light (the floor also from the top light), estimated from how close each shadow ray passes to the sword ([Quilez](https://iquilezles.org/articles/rmshadows/)). Then a filmic curve ([Narkowicz 2016](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)), a light vignette and fine grain.

Options: `?quality=low` traces at 0.6 resolution with one sample per pixel instead of four, fewer reflection samples and shorter shadow rays. `?t=<seconds>` renders one deterministic frame at that time. The loop is 20 seconds long.
