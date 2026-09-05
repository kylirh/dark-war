import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html-escape";

describe("escapeHtml", () => {
  it("escapes the five characters that change parsing", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-built", () => {
    // If & were escaped last, "<" would become "&lt;" and then "&amp;lt;".
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves text with nothing to escape untouched", () => {
    expect(escapeHtml("Base Camp 7")).toBe("Base Camp 7");
    expect(escapeHtml("")).toBe("");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeHtml("<<")).toBe("&lt;&lt;");
    expect(escapeHtml("a'b'c")).toBe("a&#39;b&#39;c");
  });

  it("neutralizes a script tag in text content", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("closes the single-quoted attribute hole", () => {
    // This is the case the four private copies all missed: they escaped `"`
    // but not `'`, so a value in a single-quoted attribute could break out.
    const hostile = "x' onerror='alert(1)";
    const rendered = `<img alt='${escapeHtml(hostile)}'>`;
    expect(rendered).not.toContain("onerror='");
    expect(escapeHtml(hostile)).toBe("x&#39; onerror=&#39;alert(1)");
  });

  it("closes the double-quoted attribute hole", () => {
    const hostile = 'x" onerror="alert(1)';
    expect(escapeHtml(hostile)).toBe("x&quot; onerror=&quot;alert(1)");
  });

  it("keeps legitimate punctuation renderable", () => {
    // Escaped entities decode back to the original glyphs in the DOM, so
    // apostrophes in real names still display correctly.
    const el = { innerHTML: "" } as { innerHTML: string };
    el.innerHTML = `<span>${escapeHtml("Kylir's Camp & Co")}</span>`;
    expect(el.innerHTML).toBe("<span>Kylir&#39;s Camp &amp; Co</span>");
  });

  it("coerces non-string input safely to prevent DoS via type confusion", () => {
    // If a value from a JSON payload (e.g. from disk or network) sneaks past a
    // TypeScript type annotation, it must be coerced to a string instead of crashing.
    expect(escapeHtml(123 as any)).toBe("123");
    expect(escapeHtml({ toString: () => "obj" } as any)).toBe("obj");
    expect(escapeHtml(null as any)).toBe("null");
    expect(escapeHtml(undefined as any)).toBe("undefined");
  });
});
