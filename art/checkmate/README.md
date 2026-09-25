# Checkmate

[![preview](preview.webp)](https://aalquwayfili.com/art/checkmate/)

A pencil drawing of an army of chess pieces, seen from low on the board. The king gives a command and it runs out across the squares as a red ring. Rank by rank, 4,000 pieces snap round to face him and bow, then are let go.

[View it live](https://aalquwayfili.com/art/checkmate/) (needs WebGPU: Chrome, Edge, or Safari 26+).

How it works:

- **The army** is four instanced draws of faceted meshes built once in JavaScript: turned pawns and a king from lathe profiles, and knights carved from tilted boxes. The vertex shader reads each piece's facing, bow and red from a storage buffer. The designs are original.
- **One compute pass per step** runs every piece on a fixed 60 Hz timestep. The command reaches a piece at `distance / speed`. An underdamped spring turns it to face the king and a second spring bows it once. A faster wave later releases the army back to its rest facing.
- **G-buffer and shadows.** The pieces go into a depth map from a low sun, then into a G-buffer of normal, distance, world position and red. The sketch pass looks up shadows with 3 × 3 percentage-closer filtering ([Reeves et al. 1987](https://doi.org/10.1145/37402.37435)).
- **Pencil.** Tone is drawn as up to three layers of crossing screen-space hatching, a simple form of tonal art maps ([Praun et al. 2001](https://doi.org/10.1145/383259.383328)). Strokes wobble and break into dashes. Contours come from jumps in depth and normal ([Saito and Takahashi 1990](https://doi.org/10.1145/97880.97901)). The whole drawing is re-jittered six times a second, like frames drawn by hand.
- **Red is the only colour.** It marks the king, the ring of the command on the board, and each piece for the moment the command passes through it.

Options: `?quality=low` for about 900 pieces and a smaller shadow map. `?t=<seconds>` renders one deterministic frame at that time. The loop is 24 seconds long.
