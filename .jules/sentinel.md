## 2025-05-18 - XSS via Unsanitized UDP Data
**Vulnerability:** The application displays server information from UDP broadcasts without sanitizing all fields. While `name` and `host` are sanitized via `escapeHtml()`, the `phase` field is directly interpolated into `innerHTML`.
**Learning:** Treat all incoming LAN data as untrusted, strictly coercing types and sanitizing strings via `escapeHtml()` to prevent injection vulnerabilities.
**Prevention:** Always sanitize every field originating from untrusted network sources before inserting into the DOM, even if the field is expected to be an enum like "lobby" or "playing".
