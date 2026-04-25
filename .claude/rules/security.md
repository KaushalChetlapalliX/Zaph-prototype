# Zaph — Security Rules
# Loaded for every session (no path scope — applies everywhere)

## Secrets & Environment
- NEVER read, log, or expose the contents of `.env` or `.env.*` files.
- Supabase URL and anon key live in `.env` only — never hardcode them in source files.
- Never commit anything that contains `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or any API key as a literal string.
- If you need to reference env vars in code, use `process.env.EXPO_PUBLIC_*` pattern and confirm the variable is already defined in `.env`.

## Auth & User Data
- Never log user passwords, tokens, or personally identifying information.
- After sign-out: clear AsyncStorage session + circle data before any navigation redirect.
- Never pass raw user IDs or auth tokens through route params — fetch them from the auth context or AsyncStorage inside the destination screen.

## Input Handling
- Any text input that gets written to the database must be trimmed and validated for length before the Supabase call.
- Circle codes (4-digit join codes) must be validated as exactly 4 numeric digits before lookup — never pass raw user input directly into a query.
- Task names or user-generated content must be length-capped before insertion.

## Dependencies
- Before installing any new npm package: check its last publish date, download count, and open issues. Avoid unmaintained packages.
- Be especially cautious with packages that require native modules — verify New Architecture compatibility first.
- Never install packages that require ejecting from Expo managed workflow without explicit confirmation.

## Network
- All Supabase calls already go over HTTPS by default — do not override this.
- Do not add any `curl`, `wget`, or raw `fetch` calls to arbitrary external URLs without a clear justified reason.
