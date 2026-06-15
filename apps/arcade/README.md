# apps/arcade — cabinet build (variant 4, planned)

The arcade-cabinet variant. **Not built yet** — this is the last variant by design,
once the other three are stable.

It will reuse the exact same shared core as every other variant (`src/engine`,
`src/client`, `src/net`); a cabinet is essentially the Electron client locked to
kiosk/fullscreen with hardware-input mapping and no OS chrome.

## When it's built, expect

- A fullscreen, always-on, kiosk launcher (no window controls, no menu bar).
- Physical control mapping (JAMMA/USB encoder → the existing input layer in
  `src/client/systems/input.ts`).
- Attract mode / coin-up flow gating the title screen.
- Fixed resolution + integer scaling for the cabinet's panel.

## Starting point

Fork the Electron app (`electron/`), force fullscreen + kiosk, disable the OS menu
and window controls, and remap input. No engine changes should be required — the
engine/client/net boundary already keeps the shared code platform-agnostic
(`src/engine-purity.test.ts` enforces it).
