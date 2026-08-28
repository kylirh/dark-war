
## 2025-02-23 - XSS in LAN Server Discovery
**Vulnerability:** Untrusted string data (`phase`) and uncoerced number data (`players`, `maxPlayers`) from LAN server broadcasts were interpolated directly into the client DOM via `innerHTML` without escaping or type coercion.
**Learning:** LAN discovery mechanisms (e.g., UDP broadcasts) in desktop apps are effectively public, untrusted inputs. They must be treated with the same suspicion as public web API payloads. The app was trusting the LAN network structure over validating the data content.
**Prevention:** Always use `escapeHtml` (or equivalent DOM sanitization) on string fields, and strictly coerce numerical fields (e.g., using `Number()`) before injecting LAN broadcast data into `innerHTML`.
