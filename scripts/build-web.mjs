#!/usr/bin/env node
/**
 * Build the web/client bundle via Vite's ESM API.
 *
 * Using the programmatic API (instead of the `vite` CLI) avoids the noisy
 * "The CJS build of Vite's Node API is deprecated" warning entirely, since we
 * load Vite as ESM. Config (output, logLevel, chunk-size limit) comes from
 * vite.config.ts.
 */
// Silence Vite's "CJS Node API is deprecated" notice (fired when it evaluates
// the TS config in a CJS context). Must be set before importing vite.
process.env.VITE_CJS_IGNORE_WARNING = "true";

const { build } = await import("vite");

try {
  await build();
} catch (error) {
  console.error(error);
  process.exit(1);
}
