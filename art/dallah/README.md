# Dallah

[![preview](preview.webp)](https://aalquwayfili.com/art/dallah/)

A brass coffee pot turns slowly on its tray beside a finjan, drawn in pencil: hatching that follows the form, shaky contours, graphite on paper grain.

[View it live](https://aalquwayfili.com/art/dallah/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- The pot, spout, handle, cup, tray and table are parametric surfaces built once in a compute pass: Catmull-Rom profiles turned on a lathe and tubes swept along Bézier curves. That makes 393,216 vertices and 780,000 triangles (31,104 vertices with `?quality=low`), with normals from finite differences.
- A tonal art map ([Praun et al. 2001](https://doi.org/10.1145/383259.383328)) is also drawn once, in a compute pass: six tones of pencil strokes, each tone keeping every stroke of the lighter ones, at every mip level with the same stroke width in texels.
- Each frame renders a sun shadow map, then a G-buffer pass lights the scene (diffuse, a brass reflection with a dark horizon band, a hard glint) and turns the light into a tone. That tone blends the two nearest levels of the art map, laid out along the surface's own lathe coordinates so the hatching wraps around the pot.
- A sketch pass draws the contours from depth jumps, normal creases and part boundaries in the G-buffer ([Saito and Takahashi 1990](https://doi.org/10.1145/97880.97901)). It samples them twice through slowly moving noise so the lines wobble and double, and redraws them four times a second like a hand-drawn loop.
- Graphite only catches on the high points of a procedural paper tooth. A soft rubbed underlay follows the tone, and the table fades out into bare paper.

Options: `?quality=low` for lighter meshes and art map. `?t=<seconds>` renders one deterministic frame at that time.
