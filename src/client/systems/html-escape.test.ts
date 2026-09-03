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

  describe("security boundaries", () => {
    it("neutralizes complex XSS polyglots", () => {
      const payload = `javascript://%250Aalert(1)//"onerror=alert(1)//<svg/onload=alert(1)>"-alert(1)"`;
      const result = escapeHtml(payload);
      expect(result).not.toContain("<svg");
      expect(result).not.toContain('"onerror');
      expect(result).toContain("&lt;svg/onload=alert(1)&gt;");
      expect(result).toContain("&quot;onerror=alert(1)//");
    });

    it("neutralizes mixed quotes and tag injections", () => {
      const payload = `><script>alert('XSS')</script><img src="x" onerror="alert('XSS')">`;
      const result = escapeHtml(payload);
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("<img");
      expect(result).toBe(
        "&gt;&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;&lt;img src=&quot;x&quot; onerror=&quot;alert(&#39;XSS&#39;)&quot;&gt;",
      );
    });
  });

  describe("type coercion boundaries", () => {
    it("throws on non-string inputs to prevent local DoS", () => {
      // Using explicit any to bypass TypeScript for testing runtime boundary
      expect(() => escapeHtml(null as any)).toThrow(TypeError);
      expect(() => escapeHtml(undefined as any)).toThrow(TypeError);

      // Numbers don't have a .replace method
      expect(() => escapeHtml(123 as any)).toThrow(TypeError);

      // Arrays don't have the string .replace method signature
      expect(() => escapeHtml(["a", "b"] as any)).toThrow(TypeError);

      // Objects don't have a .replace method
      expect(() => escapeHtml({ toString: () => "evil" } as any)).toThrow(
        TypeError,
      );
    });
  });
});
