# Brick by Brick

[![preview](preview.webp)](https://aalquwayfili.com/art/brick-by-brick/)

Olaya in Riyadh as a model of toy bricks: [Kingdom Centre](https://en.wikipedia.org/wiki/Kingdom_Centre) with its sky bridge, [Al Faisaliah](https://en.wikipedia.org/wiki/Al_Faisaliah_Tower) and its golden globe, a mosque, Najdi houses, a park, and traffic on King Fahd Road. It builds itself from the baseplate up, 4,262 bricks, then holds from afternoon into night while the windows light up, and rewinds.

[View it live](https://aalquwayfili.com/art/brick-by-brick/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **The city** is written as shapes on a grid of 64 × 128 × 64 cells, one stud wide and one plate tall, to real brick proportions: 8 mm between studs, plates 3.2 mm tall, studs 4.8 mm across and 1.7 mm high ([Brick Owl](https://www.brickowl.com/help/stud-dimensions)). Cells that can't be seen are dropped, so the model is hollow like a real one. The rest merge into bricks from the ground up, up to 2 × 4 and three plates tall, with alternate courses offset by two studs so the seams interlock like a wall. That happens once, in [`main.js`](main.js).
- **Tracing.** A fragment shader walks every pixel's ray through the grid ([Amanatides and Woo 1987](https://diglib.eg.org/items/60c72224-00f3-416d-9952-ee41e8c408da)), skipping empty 8 × 8 × 8 blocks whole. Studs are real cylinders, tested in the empty cell above each brick, so they catch light and cast shadows. Every hit sends a second ray toward the sun for the shadow.
- **Plastic.** Edges are bevelled by bending the normal near the rim of each brick, and the seams between bricks darken. Corners get ambient occlusion from the neighbouring cells ([Lysenko 2013](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/)). The surface is diffuse with a tight highlight and a Fresnel reflection of the sky, with more of it for the glass and the gold.
- **Building.** Each brick has the moment it lands. Until then it is not in the grid: bricks in the air, and the cars, are rasterised as boxes with studs into the same depth buffer, and each car casts a shadow into the traced scene.
- **The lens.** Blur grows with distance from the focal plane, as with a macro lens on a model. A little bloom for the lamps, then a filmic curve ([Narkowicz 2016](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)).

Options: `?quality=low` traces at half resolution. `?t=<seconds>` renders one deterministic frame at that time. The loop is 28 seconds long.
