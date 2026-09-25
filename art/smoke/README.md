# Bakhoor

[![preview](preview.webp)](https://aalquwayfili.com/art/smoke/)

Smoke from a mabkhara, printed like a woodblock. Every few seconds a guest wafts it toward themselves.

[View it live](https://aalquwayfili.com/art/smoke/) (needs WebGPU: Chrome, Edge, or Safari 26+).

## How it works

- **Stable fluids** ([Stam 1999](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf)) on a WebGPU compute grid: advect, add forces, then project the velocity so the flow is incompressible.
- Smoke density and heat use **MacCormack advection** with clamping ([Selle et al. 2008](https://doi.org/10.1007/s10915-007-9166-4)), so thin wisps stay sharp. Velocity uses midpoint back-tracing.
- **Vorticity confinement** ([Fedkiw, Stam & Jensen 2001](http://physbam.stanford.edu/~fedkiw/papers/stanford2001-01.pdf)) puts back the small curls the grid smooths away. Hot smoke rises by **buoyancy**, and the hand is a soft force that sweeps across the plume.
- The pressure Poisson equation is solved with **Jacobi** sweeps, warm-started from the last step. The walls and floor are solid, and the top is open.
- The ink pass samples the density with a bicubic filter, cuts it into four flat ink tones with carved contour lines between them, and presses it into fibrous paper. The burner, its ember and the seal are 2D distance shapes.
- Move the pointer through the smoke to stir it.

`?quality=low` uses a 128-cell-high grid with 12 pressure sweeps (default 512 and 40). `?t=<seconds>` steps the simulation at a fixed 1/30 s up to t, then prints one frame.
