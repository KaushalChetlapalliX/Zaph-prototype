---
name: new-screen
description: Scaffold a new Expo Router screen for Zaph. Use when asked to create a new screen, page, or route. Automatically sets up the correct structure, styles, loading/error states, and navigation.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# New Screen Scaffold

When asked to create a new screen, follow these steps exactly:

## 1. Clarify Before Writing
Ask (if not already clear):
- What is the screen's route name? (becomes the filename in `app/`)
- What data does it need to fetch from Supabase, if any?
- What screen does it navigate to on success/completion?
- Does it need authentication (should it redirect if no session)?

## 2. Check Existing Patterns First
Before writing any code:
- Read `app/circle-home.tsx` to understand the full pattern for a data-fetching screen.
- Read `app/create-circle.tsx` for a form/action screen pattern.
- Grep for the AsyncStorage keys already in use: `grep -r "AsyncStorage" app/ src/`

## 3. File Location & Name
- Create the file at `app/[route-name].tsx`
- Filename must be kebab-case
- Component name must be PascalCase matching the route (e.g., `app/task-detail.tsx` exports `export default function TaskDetail()`)

## 4. Required Screen Structure

```tsx
import { View, Text, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
// Add design system / styling imports here once the new UI system is established

export default function ScreenName() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // ... other state

  useEffect(() => {
    // fetch data here
  }, [])

  if (loading) {
    return (
      <View>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (error) {
    return (
      <View>
        <Text>{error}</Text>
      </View>
    )
  }

  return (
    <View>
      {/* screen content — apply design system styles here */}
    </View>
  )
}

// Styles: use whatever styling approach the active design system requires.
// Do not assume StyleSheet.create() — the design system may change this.
```

## 5. Supabase Data Fetching
- If the screen fetches data, create a service function in `src/services/` first.
- Import only from `src/lib/supabase.ts` in services — never in the screen directly.
- Wrap all Supabase calls in try/catch with proper `setError()` on failure.

## 6. After Creating the File
- Run `npx tsc --noEmit` to verify no TypeScript errors.
- Check that the screen is reachable from the correct navigation point (update the calling screen's `router.push()` if needed).
- Confirm the screen handles loading, error, AND success states visually.
