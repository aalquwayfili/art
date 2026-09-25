# Fanous

[![preview](preview.webp)](https://aalquwayfili.com/art/lantern/)

A pierced brass lantern turns slowly in a majlis at night and writes stars on the walls.

[View it live](https://aalquwayfili.com/art/lantern/) (needs WebGPU: Chrome, Edge, or Safari 26+).

## How it works

- A progressive **path tracer** runs in a WGSL compute shader (`shader.wgsl`), one thread per pixel. Each frame adds new samples to a floating-point accumulation buffer; while the lantern turns, the running average keeps a floor so old samples fade out.
- The scene is analytic: an ellipsoid body and a cone roof are intersected in closed form, and a hit only counts where the brass is not cut. The cut shapes (eight-pointed stars, pointed arches, paired dots) come from a pattern function on the surface.
- **Next-event estimation** sends a shadow ray to the flame and to the moonlit window from every hit. Rays that leave through a hole reach the wall, so the pattern on the walls is exact, with soft edges from the flame's size. See Veach's thesis, [ch. 9](https://graphics.stanford.edu/papers/veach_thesis/).
- The light shafts are single scattering in a thin haze, one **equi-angular** sample per camera ray ([Kulla & Fajardo 2012](https://www.arnoldrenderer.com/research/egsr2012_volume.pdf)).
- Path rays and shadow rays share one intersection call in a small queue, which keeps the compiled shader small.
- A present pass applies the ACES filmic fit ([Narkowicz 2015](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)) and a 4×4 Bayer dither to 5 bits per channel, for a low-resolution console look.

`?quality=low` renders at 270 lines with 2 bounces. `?t=<seconds>` renders a fixed 24 (low) or 256 samples at that moment.
