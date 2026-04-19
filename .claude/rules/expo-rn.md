---
paths:
  - "app/**/*.tsx"
  - "app/**/*.ts"
  - "src/components/**/*.tsx"
  - "src/components/**/*.ts"
---

# Zaph — Expo Router & React Native Rules
# Loaded only when working on screen or component files

## Expo Router
- Every file in `app/` is a route. The filename IS the URL path.
- All screens must use `default export` — Expo Router requires it.
- Use `router.push('/route-name')` for navigation, `router.replace()` when you don't want back navigation (e.g. after login).
- The `_layout.tsx` file controls the navigator wrapper — edit carefully, it affects every screen.
- `app/callback/callback.tsx` handles OAuth redirects — do not change its export shape or the OAuth flow breaks.

## New Architecture Compatibility
- `newArchEnabled: true` is set in app.json. Before adding any new library, verify it supports React Native's New Architecture (Fabric/TurboModules).
- Avoid libraries that use the old bridge directly. Check the library's GitHub issues before installing.

## Navigation Patterns
- After successful login/signup, use `router.replace()` to prevent the user from navigating back to auth screens.
- After completing onboarding, use `router.replace('/user-home')`.
- Pass minimal data via route params — fetch full data from Supabase/AsyncStorage inside the destination screen.

## AsyncStorage
- All AsyncStorage keys must be defined as constants (not inline strings). When creating new ones, add them to a central constants file.
- Current key pattern: string keys stored in `AsyncStorage` for session, circle ID, and task state.
- Never store sensitive data (tokens beyond what Supabase handles, passwords) directly in AsyncStorage.

## Screen Structure Template
Every new screen should follow this order:
1. Imports
2. Type definitions (if any)
3. AsyncStorage key constants (if any)
4. Default export component
5. Inside component: state → effects → handlers → return JSX
6. Styles at the bottom of the file (approach determined by the active design system)

Note: Visual design conventions (colors, icons, gradients, styling library) are being fully redesigned. Do not carry over any old palette or component patterns. Follow the design system that is introduced during the redesign.
