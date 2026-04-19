---
paths:
  - "src/lib/**/*.ts"
  - "src/services/**/*.ts"
  - "app/**/*.tsx"
---

# Zaph — Supabase Rules
# Loaded when working on database/auth/service layer files

## The Golden Rule
- Supabase is ONLY imported in `src/lib/supabase.ts`. No other file ever imports from `@supabase/supabase-js` directly.
- Screens call service functions. Service functions call supabase. This is a hard architectural boundary.
- If a service layer doesn't exist yet for a feature, create it in `src/services/` before writing screen code.

## Auth
- Auth state comes from `supabase.auth.getUser()` or `supabase.auth.onAuthStateChange()`.
- OAuth callback is handled in `app/callback/callback.tsx` — redirect URIs in Supabase dashboard must match the app's scheme.
- Never store raw auth tokens yourself — the Supabase client with AsyncStorage persistence handles this.
- After sign-out, clear all relevant AsyncStorage keys (circle ID, task state, etc.) before redirecting.

## Database Queries
- Always handle the `{ data, error }` destructure from every Supabase call — never assume success.
- Log errors with enough context to debug (which function, what inputs), but never surface raw Supabase errors to the user.
- Use `.select('only,the,columns,you,need')` — never `select('*')` in production code unless genuinely needed.
- For leaderboard and real-time features, prefer Supabase Realtime subscriptions over polling intervals (current 3000ms polling is a known tech debt).

## Real-Time
- Current polling interval is 3000ms. When refactoring to Realtime: use `supabase.channel()` subscriptions and always clean them up in `useEffect` return functions.
- Subscriptions must be unsubscribed on component unmount to prevent memory leaks.

## Data Shapes
- Weekly scoring: tasks complete Monday–Sunday UTC, 5 points per task.
- Circle membership: one active circle per user at a time.
- Circle codes: 4-digit numeric codes for joining.
- When adding new tables or columns, update `src/types/` with the corresponding TypeScript type before writing any query code.

## Error Handling Pattern
```ts
const { data, error } = await supabase.from('table').select('...')
if (error) {
  console.error('[functionName] Supabase error:', error.message)
  // surface a user-friendly message, not the raw error
  return
}
```
