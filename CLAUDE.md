# Zaph — CLAUDE.md

## What This App Is
Zaph is a gamified social accountability app. Users form "Circles" (small friend groups), pick a challenge difficulty, select personal tasks, and compete on a weekly leaderboard. The core loop: create/join circle → pick tasks → complete tasks → earn points → see who wins the week.

## Commands
```
npx expo start          # Start dev server (press i for iOS, a for Android)
npx expo run:ios        # Native iOS build
npx expo run:android    # Native Android build
npx tsc --noEmit        # Type-check without building
npx expo lint           # Lint (if configured)
```
No test suite yet. When one is added, document it here.

## Architecture
- **Framework**: Expo Router v6 (file-based routing), React Native 0.81, React 19
- **Language**: TypeScript strict mode — no `any`, no unused vars, no unused imports
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Auth**: Supabase email auth + Google OAuth via expo-auth-session
- **Local state**: AsyncStorage for session, circle ID, task state
- **Screens**: All in `app/` as Expo Router pages (file = route)
- **Components**: Reusable UI in `src/components/`
- **DB client**: Only in `src/lib/supabase.ts` — never import supabase directly in screens
- **Types**: Define shared types in `src/types/` (create this folder when needed)

## Conventions
- All Supabase calls go through service functions — screens call services, not supabase directly
- AsyncStorage keys must be constants, not magic strings
- Every screen that fetches data must handle loading + error states visually
- Real-time polling is currently 3000ms intervals — prefer Supabase subscriptions when refactoring
- Never commit `.env` or expose Supabase keys in code

## Watch Out
- TypeScript strict mode: unused imports are errors, `any` is banned
- New Architecture is enabled (`newArchEnabled: true`) — avoid libraries incompatible with it
- `app/start-cricle.tsx` has a typo ("cricle") — leave it until a full rename is planned
- Supabase client uses AsyncStorage for session persistence — do not replace with another storage
- OAuth callback is handled in `app/callback/callback.tsx` — redirect URIs must match Supabase config
