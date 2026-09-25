# Transmutation

[![preview](preview.webp)](https://aalquwayfili.com/art/transmutation/)

A circle draws itself in chalk on a stone floor and flares. A heap of 262,144 grains spirals up, settles into a carved lattice, stands for a while, then crumbles back into the heap.

[View it live](https://aalquwayfili.com/art/transmutation/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **The chalk circle** is drawn by the fragment shader as 2D distance fields on the floor plane: hand-wobbled rings, a {7/3} star polygon, a band of glyphs picked from hash bits, each stroke revealed along its own arc length. Crackles are jagged value-noise polylines, redrawn 12 times a second. It is an original design, not a copy of any circle from the anime.
- **The target shape** is a signed distance field: a ball cut by a gyroid shell ([Schoen 1970](https://ntrs.nasa.gov/citations/19700020472)) on a short column. Each grain gets its place on the surface once, in a compute pass. A random point in the bounds is moved onto the zero set with Newton steps, `p -= f(p) ∇f(p)`, using the distance and gradient of the field ([Hart 1996](https://doi.org/10.1007/s003710050084)).
- **One compute pass per step** moves every grain on a fixed 60 Hz timestep. Grains wait on the heap, rise bottom-first on a damped spring with a swirl about the axis that dies away as they arrive, and fall top-first under gravity, bouncing on the floor. Then they drift back into the heap while the chalk is rubbed out.
- **Drawing.** A splat pass projects every grain into a 640 × 360 pixel canvas. The nearest grain wins each pixel through `atomicMax` on a packed depth and shade word. The same pass drops each grain's shadow into a 192 × 192 floor map with `atomicAdd`. Grains resting on a surface cover 2 × 2 pixels so it closes up, and grains in the air stay single specks.
- The floor, chalk and grains are drawn together in one fullscreen pass, quantised with a 4 × 4 Bayer dither.

Options: `?quality=low` for 65,536 grains on a 480 × 270 canvas. `?t=<seconds>` renders one deterministic frame at that time. The loop is 24 seconds long.
