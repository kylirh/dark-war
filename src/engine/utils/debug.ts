let _debug = false;

try {
  // If Vite injects this, use it
  // @ts-ignore
  if (
    // @ts-ignore
    typeof import.meta !== "undefined" &&
    // @ts-ignore
    (import.meta as any).env?.VITE_DEBUG === "true"
  ) {
    _debug = true;
  }
} catch (e) {
  // Ignore
}

try {
  // @ts-ignore
  if (typeof process !== "undefined" && process.env.VITE_DEBUG === "true") {
    _debug = true;
  }
} catch (e) {
  // Ignore
}

// Global debug flag on window for runtime toggling
if (typeof window !== "undefined") {
  if (typeof (window as any).__DEBUG === "undefined") {
    (window as any).__DEBUG = _debug;
  }
}

export function isDebug(): boolean {
  if (typeof window !== "undefined") {
    return (window as any).__DEBUG === true;
  }
  return _debug;
}

export function setDebug(value: boolean): void {
  if (typeof window !== "undefined") {
    (window as any).__DEBUG = value;
  }
  _debug = value;
}

export function toggleDebug(): boolean {
  const newVal = !isDebug();
  setDebug(newVal);
  return newVal;
}

if (typeof window !== "undefined") {
  (window as any).toggleDebug = toggleDebug;
  (window as any).setDebug = setDebug;
}
