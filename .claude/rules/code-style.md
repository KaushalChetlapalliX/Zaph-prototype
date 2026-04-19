# Zaph — Code Style Rules
# Loaded for every session (no path scope — applies everywhere)

## TypeScript
- Strict mode is ON. Zero tolerance for `any`, unused imports, or unused variables.
- Prefer named exports over default exports everywhere except Expo Router screens (which require default exports).
- Define shared types in `src/types/` — never inline complex types in screen files.
- Use `interface` for object shapes, `type` for unions/aliases.
- Never use type assertions (`as SomeType`) without a comment explaining why.

## React Native
- Use `useCallback` and `useMemo` when passing functions or derived values as props to child components.
- Loading and error states are mandatory for every screen that fetches data. No silent spinners or blank screens.
- UI/design conventions (colors, styling approach, component library) are being fully redesigned — do not assume any existing visual patterns. Follow whatever design system is introduced.

## Naming
- Screens (in `app/`): kebab-case filenames, PascalCase component names (e.g., `circle-home.tsx` exports `CircleHome`).
- Components (in `src/components/`): PascalCase filename and component name (e.g., `CircleCodeSheet.tsx`).
- AsyncStorage keys: SCREAMING_SNAKE_CASE constants defined in one central file — never magic strings inline.
- Supabase service functions: verb-first, descriptive (e.g., `fetchLeaderboard`, `completeTask`, `createCircle`).

## File Length
- No screen file over 300 lines. If a screen is growing past that, extract logic into a custom hook or split UI into sub-components.
- Components in `src/components/` should do one thing. If a component needs more than 3 props-drilling levels, reconsider the structure.

## Comments
- Comment the "why", not the "what". Code explains what it does. Comments explain non-obvious decisions.
- Every Supabase query that is not obvious should have a comment describing the expected shape of the result.
