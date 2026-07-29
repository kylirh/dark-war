# AI-assisted asset workflow

AI is a fast concept and tooling partner, not a runtime asset generator or an
unreviewed source of production pixels.

## Approved loop

1. Start from `docs/ART-DIRECTION.md`, `STYLE.md`, the palette, target grid, and
   exact semantic family. State required views, animation frames, seams, and
   lighting direction in the prompt.
2. Save useful concepts under `references/` with the prompt, model/tool, date,
   and intended semantic keys. Concepts may explore shape, mood, color grouping,
   and silhouettes.
3. Reconstruct production art on the 32×32 grid in Aseprite. Enforce the palette,
   cluster language, pivots, footprints, topology, and tileability by hand.
4. Commit the reviewed `.aseprite`, `.tsj`, or `.tmj` source. Never treat an
   ephemeral generated PNG as the only source of truth.
5. Run `npm run gen:visual-assets`, inspect the atlas and prefab output, then run
   `npm test`, `npm run type-check`, and an in-game visual pass.

## Strong uses of AI

- mood boards, silhouette sheets, prop ideation, and color studies;
- deterministic sprite-generator and validation code;
- controlled variations that an artist cleans and palette-locks;
- identifying broken seams, missing masks, inconsistent light, or noisy pixels;
- drafting Tiled prefab layouts that are then opened and reviewed in Tiled.

## Rejection criteria

Reject or repaint assets with outlines that violate the style, muddy palettes,
single-pixel noise, inconsistent perspective or light, unreadable gameplay
silhouettes, copied branding/characters, broken tile seams, or no editable source.
Record provenance for every retained generated reference. Do not request a living
artist's exact style; describe Dark War's approved visual traits and use the
named games only as broad directional references.
