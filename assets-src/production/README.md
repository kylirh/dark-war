# Production sprite boards

These transparent boards are reviewed production inputs for
`tools/gen-spritesheet.mjs`. The generator alpha-trims props and characters,
nearest-neighbor samples them onto Dark War's 32-pixel grid, and uses quiet
interior crops for seamless terrain fields. Runtime never loads these boards.

## Provenance

- Generated 2026-07-29 with OpenAI's built-in image-generation tool.
- Direction references:
  - `assets-src/references/art-direction/environment-concept.png`
  - `assets-src/references/art-direction/character-concept.png`
- Flat magenta was removed by `tools/remove-chroma.mjs`.
- The generated atlas, native-scale silhouettes, animation identity, transparent
  bounds, and terrain crops were reviewed before promotion.

## Environment prompt

> Create a strict 6×4 orthographic pixel-art board containing grass, flower
> grass, dirt, stone, reclaimed asphalt, sidewalk, shallow and deep turquoise
> water, bridge, cliffs, ruin and wood walls, doors, stairs, cave, tree,
> streetlight, terminal, crate, barrel, garden, and workshop. Use polished
> outline-free painterly clusters, a limited vibrant palette, warm upper-left
> light, cool teal/plum shadows, identical scale and camera, and a perfectly
> flat magenta background. No labels, borders, black outlines, UI, watermark,
> or photorealism.

## Character and icon prompt

> Create a strict 6×4 pixel-art board with a consistent teal-and-mustard player
> builder animation family, friendly dog, utility robot, mushroom person,
> beetle mutant, rat, fluttering bug, slime, reclaimed security robot, pistol,
> matter manipulator, medkit, battery, keycard, coin, crate, and potted flower.
> Use cheerful expressive silhouettes, outline-free clusters, warm upper-left
> light, limited shared color ramps, and a perfectly flat magenta background.
> No labels, scenery, gore, military realism, watermark, or black outlines.

## Supplemental prompt

> Create a strict 6×4 supplemental board with paired animation poses for a
> friendly green mutant, orange catlike mutant, cybercop robot, crystal alien,
> turquoise garden-tentacle creature, and human scavenger, followed by cohesive
> knife, laser gun, gyrojet weapons, swords, repaired armor, panic button, bone,
> cookie, rock, and vending machine assets. Match the same cheerful,
> outline-free, cluster-rendered palette and lighting on a flat magenta
> background.

## Board contract

- `environment-board.png`: six columns × four rows of terrain and props.
- `characters-board.png`: six columns × four rows of primary actors and icons.
- `supplemental-board.png`: six columns × four rows of remaining actors and
  equipment.

Do not reorder cells without updating `tools/gen-spritesheet.mjs`. If a source
is repainted in Aseprite, preserve its cell assignment until the generated
manifest replaces coordinate coupling.
