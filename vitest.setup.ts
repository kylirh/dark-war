// Entities and events use the global `crypto.randomUUID()`, which exists in the
// browser/Electron renderer but not in Node 18 by default. Provide it for tests.
import { webcrypto } from "node:crypto";

if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

(global as any).window = {
  location: { search: "" },
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: () => {},
  native: undefined,
};

(global as any).document = {
  getElementById: () => ({}),
  createElement: () => ({ style: {}, classList: { add: () => {} } }),
  body: {
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
  },
  documentElement: { classList: { add: () => {}, remove: () => {} } },
};
