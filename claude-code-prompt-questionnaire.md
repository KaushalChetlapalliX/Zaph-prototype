# Claude Code Prompt — Zaph Questionnaire & Motivation System

Paste everything below this line into Claude Code.

---

## Before You Write a Single Line of Code — Read These Files First

```bash
cat CLAUDE.md .claude/rules/code-style.md .claude/rules/design.md .claude/rules/impeccable.md .claude/rules/security.md
```

Also read `src/constants/design.ts` — every color, spacing value, radius, and font size in every file you touch MUST come from this file. No hardcoded hex values. No magic numbers.

Do not proceed until you have read all of these.

---

## Context

You are working on **Zaph**, a gamified social accountability app.
Project path: `/Users/kaushalchetlapalli/zaph-prototype`
Stack: Expo Router v6, React Native 0.81, React 19, TypeScript strict, Supabase.

**Two migrations have already been applied to Supabase.** Do not re-run them. The database already has the schema described below.

The visual theme must not change — pure dark, black base (#000000), card surfaces (#1C1C1E), green CTA (#3DAA6A). Reference `app/user-home.tsx` and `app/circle-home.tsx` as your visual benchmark for any new screen.

---

## Current Database Schema (fully verified)

### Unchanged tables
```
profiles:
  id, username, created_at, first_name, last_name, full_name, display_name
  *** NEW: motivation_score (numeric 1.00–5.00)
  *** NEW: motivation_tier ('low' | 'medium' | 'high')
  *** NEW: questionnaire_completed (boolean DEFAULT false)
  *** NEW: questionnaire_completed_at (timestamptz)

circles:
  id, code, difficulty, created_by, created_at, name, started_at, started_by
  stage CHECK: ('lobby','selecting','loading','confirm','active')
  *** NEW: daily_task_count (int DEFAULT 6)

circle_members:
  (circle_id, user_id) PK, role, joined_at, display_name,
  tasks_done, first_name, last_name, categories_selected (bool)
  user_id FK → auth.users(id)
```

### New tables (from category migration)
```
categories:            id, name, description, icon (emoji), sort_order, is_active
category_subtasks:     id, category_id, title, sort_order
task_completions:      id, circle_id, user_id, category_id, subtask_id,
                       points (DEFAULT 5), completed_at, completed_on (date), completed_day

circle_member_category_selections:
  id, circle_id, user_id, category_id, created_at
  *** NEW: is_common (boolean DEFAULT false)
  *** NEW: assigned_by ('user' | 'algorithm' DEFAULT 'user')
  UNIQUE (circle_id, user_id, category_id)
```

### Brand new table (from questionnaire migration)
```
user_questionnaire_responses:
  id, user_id (FK → auth.users), question_key (text), answer_value (text), created_at
  UNIQUE (user_id, question_key, answer_value)
```

### All RPCs available
```
create_circle_with_code(difficulty, desired_code, circle_name) → { out_circle_id, out_code }
join_circle(code)                                              → circle_id
set_circle_stage(p_circle_id, p_stage)                        → void
start_circle_week(p_circle_id)                                 → void (admin only)
all_members_selected_categories(p_circle_id)                   → boolean
get_category_count_for_difficulty(p_difficulty)                → int (2/3/5)
compute_and_save_motivation_score()                            → numeric (called by current user)
compute_circle_assignments(p_circle_id)                        → void (admin only)
```

---

## How the New System Works — Read This Carefully

### Questionnaire (one-time, per user, not per circle)
Every new user completes an 8-question questionnaire immediately after account creation. Existing users who haven't done it are redirected to it on login. Answers are stored in `user_questionnaire_responses`.

### Motivation Score
Computed from questionnaire answers by calling `compute_and_save_motivation_score()`. Saved to `profiles`. Three tiers:
- **Low (1.0–2.4)** → circle gets 4 tasks/day
- **Medium (2.5–3.4)** → circle gets 6 tasks/day
- **High (3.5–5.0)** → circle gets 9 tasks/day

### Category Scoring (client-side, in `src/lib/questionnaire.ts`)
Maps questionnaire answers to the 10 categories using a scoring table. Top 3 scores = suggested categories. Done entirely in TypeScript — no RPC needed. (See full scoring table below.)

### Subtask Suggestion (client-side)
From the category subtasks fetched from Supabase, the app selects which subtasks to surface first based on the user's drill-down answers and motivation tier. User sees pre-selected subtasks and can swap them.

### Circle Category Assignment
Once all members confirm their 3 categories and the admin triggers it, `compute_circle_assignments()` runs and:
1. Finds the 2 most-picked categories across the circle → marks as `is_common = true`
2. Each member's remaining selection → `is_common = false` (personal)
3. Circle average motivation → sets `circles.daily_task_count` (4, 6, or 9)

---

## The 8 Questions — Exact Keys and Values

Store EVERY answer in `user_questionnaire_responses` as:
`{ user_id, question_key, answer_value }`

### Q1 — life_context (single pick, auto-advance)
**"Where are you at right now?"**
| answer_value | label |
|---|---|
| `grinding_unbalanced` | Grinding hard but losing balance |
| `getting_by` | Getting by, want to level up |
| `in_a_rut` | In a rut and need a real reset |
| `building_inconsistent` | Building something but lacking consistency |

### Q2 — primary_focus (single pick, auto-advance) ⭐ Strongest signal
**"What's the one thing that, if you fixed it, would change everything?"**
| answer_value | label |
|---|---|
| `physical_health` | My physical health & energy |
| `focus_clarity` | My focus & mental clarity |
| `sleep_recovery` | My sleep & recovery |
| `money_habits` | My money habits |
| `relationships` | My relationships & social life |
| `daily_discipline` | My daily discipline |

### Q3 — blocker (single pick, auto-advance) ⭐ Feeds motivation score
**"Be honest — what usually stops you?"**
| answer_value | label |
|---|---|
| `strong_start_fade` | I start strong but always lose momentum |
| `unpredictable_life` | Life gets unpredictable and I fall off |
| `distracted` | I get distracted way too easily |
| `no_accountability` | I have no one to keep me accountable |
| `dont_know_where_to_start` | I genuinely don't know where to begin |

### Q4 — last_week_wish (multi-pick, up to 2, stored as MULTIPLE ROWS)
**"Look back at last week. What do you wish you'd done more of?"**
| answer_value | label |
|---|---|
| `physical` | Moved my body / worked out |
| `focus` | Focused deeply without distraction |
| `sleep` | Slept better / had more energy |
| `money` | Saved money or tracked spending |
| `connect` | Connected with people that matter |
| `space` | Took care of my space or environment |
| `meaningful` | Worked on something meaningful |

### Q5 — drill_down (conditional, 1–2 questions based on Q2)
**Only show if Q2 answer maps to a drill-down category:**

**If Q2 = physical_health:**
Question: "What describes your current fitness level?"
| answer_value | label |
|---|---|
| `fitness_beginner` | Complete beginner |
| `fitness_inconsistent` | Tried but inconsistent |
| `fitness_sometimes` | Exercise sometimes |
| `fitness_active` | Already active, want more |

**If Q2 = sleep_recovery:**
Question: "How would you describe your sleep right now?"
| answer_value | label |
|---|---|
| `sleep_good` | I sleep well and wake up refreshed |
| `sleep_okay` | It's okay but could be better |
| `sleep_struggle` | I struggle with sleep regularly |
| `sleep_chaotic` | My schedule is all over the place |

**If Q2 = focus_clarity:**
Question: "What's your biggest focus killer?"
| answer_value | label |
|---|---|
| `focus_phone` | My phone |
| `focus_environment` | Noisy or chaotic environment |
| `focus_overwhelm` | Too many things to think about |
| `focus_energy` | Low energy, brain fog |

**If Q2 = money_habits, relationships, or daily_discipline:** No drill-down — skip Q5.

### Q6 — competitive_style (single pick, auto-advance) ⭐ Feeds motivation score
**"When you're in a group challenge, you're the one who..."**
| answer_value | label |
|---|---|
| `goes_hardest` | Goes hardest and wants to win |
| `fired_up_by_others` | Gets fired up watching others do well |
| `quiet_competitor` | Quietly competes against yourself |
| `needs_group_energy` | Needs the group energy just to show up |

### Q7 — confidence_score (slider 1–10, stored as text e.g. "7") ⭐ Primary motivation input
**"How confident are you that you'll show up every day this week?"**
Slider from 1 ("Not confident") to 10 ("Very confident").
Large animated number in brand green shows current value above slider.

### Q8 — circle_intent (single pick, stored but used for routing only)
**"Are you joining with friends, or starting fresh?"**
| answer_value | label | next screen |
|---|---|---|
| `with_friends` | I have people ready to join | create-circle |
| `going_solo` | I'm flying solo, open to a new circle | create-circle |

---

## Category Scoring Algorithm (implement in `src/lib/questionnaire.ts`)

This runs client-side after Q4 is answered. Returns a score map and top 3 category names.

```typescript
// Category identifiers match the `categories.name` field in Supabase
const CATEGORY_NAMES = {
  PHYSICAL:    'Physical Activity',
  FOCUS:       'Deep Focus',
  ACADEMIC:    'Academic Mastery',
  SLEEP:       'Sleep Hygiene',
  NUTRITION:   'Hydration & Nutrition',
  FINANCIAL:   'Financial Discipline',
  MENTAL:      'Mental Well-being',
  SOCIAL:      'Social Quality',
  ENVIRONMENT: 'Environment',
  CONSISTENCY: 'Consistency',
}

// Q2 primary_focus → category scores (+3 primary, +1 related)
const Q2_SCORES: Record<string, Partial<Record<string, number>>> = {
  physical_health:   { 'Physical Activity': 3, 'Sleep Hygiene': 1 },
  focus_clarity:     { 'Deep Focus': 3, 'Mental Well-being': 1 },
  sleep_recovery:    { 'Sleep Hygiene': 3, 'Physical Activity': 1 },
  money_habits:      { 'Financial Discipline': 3 },
  relationships:     { 'Social Quality': 3 },
  daily_discipline:  { 'Consistency': 3 },
}

// Q1 life_context → category scores (+1 weak signal)
const Q1_SCORES: Record<string, Partial<Record<string, number>>> = {
  grinding_unbalanced:    { 'Mental Well-being': 1, 'Social Quality': 1 },
  getting_by:             { 'Consistency': 1 },
  in_a_rut:               { 'Consistency': 1, 'Mental Well-being': 1 },
  building_inconsistent:  { 'Deep Focus': 1, 'Consistency': 1 },
}

// Q4 last_week_wish → category scores (+2 each)
const Q4_SCORES: Record<string, Partial<Record<string, number>>> = {
  physical:    { 'Physical Activity': 2 },
  focus:       { 'Deep Focus': 2 },
  sleep:       { 'Sleep Hygiene': 2 },
  money:       { 'Financial Discipline': 2 },
  connect:     { 'Social Quality': 2 },
  space:       { 'Environment': 2 },
  meaningful:  { 'Deep Focus': 1, 'Consistency': 1 },
}

// Q3 blocker → weak category signal (+1)
const Q3_SCORES: Record<string, Partial<Record<string, number>>> = {
  strong_start_fade:        { 'Consistency': 2 },
  unpredictable_life:       { 'Consistency': 1 },
  distracted:               { 'Deep Focus': 2 },
  no_accountability:        { 'Consistency': 1 },
  dont_know_where_to_start: { 'Consistency': 1 },
}

export function computeCategoryScores(responses: Record<string, string[]>): Record<string, number> {
  const scores: Record<string, number> = {}

  const addScores = (map: Partial<Record<string, number>>) => {
    for (const [cat, pts] of Object.entries(map)) {
      scores[cat] = (scores[cat] ?? 0) + (pts ?? 0)
    }
  }

  // Q1
  const q1 = responses['life_context']?.[0]
  if (q1 && Q1_SCORES[q1]) addScores(Q1_SCORES[q1])

  // Q2 (strongest signal)
  const q2 = responses['primary_focus']?.[0]
  if (q2 && Q2_SCORES[q2]) addScores(Q2_SCORES[q2])

  // Q3
  const q3 = responses['blocker']?.[0]
  if (q3 && Q3_SCORES[q3]) addScores(Q3_SCORES[q3])

  // Q4 (can have 2 answers)
  const q4answers = responses['last_week_wish'] ?? []
  for (const ans of q4answers) {
    if (Q4_SCORES[ans]) addScores(Q4_SCORES[ans])
  }

  return scores
}

export function getTopCategories(scores: Record<string, number>, count = 3): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([name]) => name)
}
```

---

## Subtask Suggestion Logic (implement in `src/lib/questionnaire.ts`)

Given a category name, the user's drill-down answer, and their motivation tier, return which subtask titles to highlight (shown first / pre-selected).

```typescript
// Maps drill-down answer → preferred subtask titles for that category
const SUBTASK_PREFERENCES: Record<string, Record<string, string[]>> = {
  'Physical Activity': {
    fitness_beginner:     ['Morning stretch / yoga', '30 min workout'],
    fitness_inconsistent: ['30 min workout', 'Hit 10,000 steps'],
    fitness_sometimes:    ['30 min workout', 'Run 3km'],
    fitness_active:       ['Run 3km', 'Hit 10,000 steps'],
    // motivation-based fallback (no drill-down)
    low:                  ['Morning stretch / yoga', '30 min workout'],
    medium:               ['30 min workout', 'Hit 10,000 steps'],
    high:                 ['Run 3km', 'Hit 10,000 steps'],
  },
  'Sleep Hygiene': {
    sleep_good:    ['Consistent wake-up time', 'No screens 30min before bed'],
    sleep_okay:    ['In bed by 11pm', 'Get 7+ hours of sleep'],
    sleep_struggle:['In bed by 11pm', 'Wake up before 8am'],
    sleep_chaotic: ['Consistent wake-up time', 'In bed by 11pm'],
    low:           ['In bed by 11pm', 'Get 7+ hours of sleep'],
    medium:        ['In bed by 11pm', 'Wake up before 8am'],
    high:          ['Consistent wake-up time', 'No screens 30min before bed'],
  },
  'Deep Focus': {
    focus_phone:       ['Phone-free morning', '2hr deep work block'],
    focus_environment: ['2hr deep work block', 'Complete one key task'],
    focus_overwhelm:   ['Complete one key task', '1hr reading'],
    focus_energy:      ['1hr reading', 'Complete one key task'],
    low:               ['Complete one key task', '1hr reading'],
    medium:            ['2hr deep work block', 'Complete one key task'],
    high:              ['2hr deep work block', 'No social media before noon'],
  },
}

// For categories without drill-down, use motivation tier as key
export function getSuggestedSubtasks(
  categoryName: string,
  drillDownAnswer: string | null,
  motivationTier: 'low' | 'medium' | 'high'
): string[] {
  const prefs = SUBTASK_PREFERENCES[categoryName]
  if (!prefs) return [] // no preference defined, show all
  const key = drillDownAnswer && prefs[drillDownAnswer] ? drillDownAnswer : motivationTier
  return prefs[key] ?? prefs[motivationTier] ?? []
}
```

---

## Files to Create

### 1. `src/types/questionnaire.ts`
```typescript
export interface QuestionnaireResponses {
  life_context?: string
  primary_focus?: string
  blocker?: string
  last_week_wish?: string[]   // multi-pick, up to 2
  drill_down?: string
  competitive_style?: string
  confidence_score?: string   // '1'–'10'
  circle_intent?: string
}

export interface CategoryScore {
  name: string
  score: number
}

export type MotivationTier = 'low' | 'medium' | 'high'

export interface SuggestedCategory {
  id: string
  name: string
  icon: string
  description: string
  score: number
  suggestedSubtasks: string[]  // titles of the 2-3 recommended subtasks
}
```

### 2. `src/lib/questionnaire.ts`
Contains all the scoring logic defined above:
- `computeCategoryScores(responses)` → scores map
- `getTopCategories(scores, count)` → string[] of category names
- `getSuggestedSubtasks(categoryName, drillDown, tier)` → string[] of subtask titles
- `computeMotivationTierLocal(confidence, blocker, competitive)` → MotivationTier
  (client-side version for immediate UI feedback before RPC call)

### 3. `app/questionnaire.tsx` (NEW SCREEN — default export required)

**The main questionnaire flow. Multi-step within a single screen using local state.**

**Progress bar:** thin bar at very top of screen (below safe area), white fill, dark track. Fills as user advances. Height 3px, no radius.

**Back button:** small square dark card (#1C1C1E) top-left with ← arrow. Goes to previous question. On Q1, goes back to the previous app screen (router.back()).

**Question layout:**
```
SafeAreaView (bg: #000000)
  ├── Progress bar (full width, 3px)
  ├── Back button (top-left, absolute)
  ├── ScrollView (contentContainerStyle: flex-grow, justify-content: space-between)
  │     ├── Question block
  │     │     ├── Question text (text.title style, white, bold, size 24, line wraps)
  │     │     └── Subtitle (text.label style, secondary color, size 14)
  │     └── Options block
  └── [Continue button — only for multi-pick Q4 and slider Q7]
```

**Option button (single-pick, auto-advance):**
- Height: 58, full width, radius: `Radius.cardSm` (12)
- Background unselected: `Colors.bg.card` (#1C1C1E)
- Background selected: `Colors.brand.green` (#3DAA6A)
- Text: `text.body` style, white, weight 500
- `activeOpacity={0.7}`
- On tap: save answer + advance to next question after 180ms (let the selection flash register visually)

**Multi-pick option button (Q4):**
- Same as above but tapping toggles selected state, doesn't auto-advance
- Shows checkmark icon (Ionicons checkmark) right side when selected
- "Continue" CTA appears at bottom once 1+ selected, disabled until then

**Slider (Q7):**
- Use React Native's built-in `Slider` from `@react-native-community/slider` — check if installed, if not use a `PanResponder`-based custom slider
- Large animated number above (72px, `Colors.brand.green`, `text.hero` style) shows current value
- "Not confident" / "Very confident" labels below slider, secondary color
- Continue button below

**State management:**
```typescript
const [step, setStep] = useState(0)
const [responses, setResponses] = useState<QuestionnaireResponses>({})
const [saving, setSaving] = useState(false)
```

**Question order:**
```
step 0 → Q1 (life_context)
step 1 → Q2 (primary_focus)
step 2 → Q3 (blocker)
step 3 → Q4 (last_week_wish)
step 4 → Q5 (drill_down) — only if Q2 has drill-down, else skip to step 5
step 5 → Q6 (competitive_style)
step 6 → Q7 (confidence_score)
step 7 → Q8 (circle_intent)
```

**On completing Q8:**
1. Set `saving = true` — show loading state ("Building your profile...")
2. Save all answers to `user_questionnaire_responses` via batch insert:
   ```typescript
   const rows = []
   for the single-pick answers: push { question_key, answer_value }
   for Q4 (array): push one row per answer
   await supabase.from('user_questionnaire_responses').insert(rows)
   ```
3. Call `supabase.rpc('compute_and_save_motivation_score')` → get back motivation score
4. Compute category scores client-side using `computeCategoryScores(responses)`
5. Fetch categories from Supabase to get ids: `supabase.from('categories').select('id, name, icon, description')`
6. Fetch all subtasks: `supabase.from('category_subtasks').select('id, category_id, title')`
7. Build `SuggestedCategory[]` array from top 3 category names
8. Navigate to `category-suggestion` passing the suggestions as route params (JSON stringified)

**Loading state:** Replace the question content with a centered "Building your profile..." text + ActivityIndicator while saving.

**Error state:** Alert.alert on any Supabase error.

---

### 4. `app/category-suggestion.tsx` (NEW SCREEN — default export required)

**Shows the 3 suggested categories. User can accept or swap one.**

**Route params:** `suggestions` (JSON string of `SuggestedCategory[]`), `motivationScore` (string)

**Layout:**
```
SafeAreaView (bg: #000000)
  ├── Header: "Your categories" (text.title, centered) + subtitle showing motivation tier
  ├── Motivation badge: pill showing tier ("High Energy" | "Steady" | "Easy Start")
  │   bg: Colors.bg.card, text: secondary
  ├── ScrollView
  │     ├── Category cards (3, one per suggested category)
  │     └── "Not feeling one of these?" text link → opens swap sheet
  └── Fixed bottom: "Let's go" green CTA button
```

**Category card:**
- Full width, bg: `Colors.bg.card`, radius: `Radius.card` (16), padding: `Spacing.cardPadding`
- Left: emoji icon (32px) in a 48×48 circle (bg: #2C2C2E, radius: 24)
- Center: category name (`text.section`, white) + description (`text.label`, secondary)
- Right: `is_common` badge (shown after algorithm runs, but NOT shown here yet — leave blank)
- Bottom: horizontal scroll of suggested subtask pills (bg: #2C2C2E, text: secondary, radius: pill)
- Subtle green left border (3px, `Colors.brand.greenBright`) to show it's selected

**Swap sheet (bottom sheet modal):**
- Shows all 10 categories in a flat list
- User taps one to replace one of the 3 suggested (show "Replace which?" step if >1 selected)
- Keep it simple: tapping a replacement replaces the lowest-scored of the current 3

**On "Let's go" press:**
1. Navigate to `create-circle` (the main circles hub) — questionnaire is done
2. Store motivation score and category suggestions in AsyncStorage keys:
   - `ZAPH_MOTIVATION_TIER`
   - `ZAPH_SUGGESTED_CATEGORIES` (JSON)

---

## Files to Modify

### `app/create-account.tsx`
**Change:** After successful account creation and profile upsert, navigate to `questionnaire` instead of `create-circle`.

```typescript
// After profile upsert succeeds:
router.replace('/questionnaire')
```

### `app/signup.tsx` (login screen)
**Change:** After successful login, check if questionnaire is completed before navigating.

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('questionnaire_completed')
  .eq('id', user.id)
  .single()

if (!profile?.questionnaire_completed) {
  router.replace('/questionnaire')
} else {
  router.replace('/user-home')
}
```

### `app/index.tsx` (onboarding carousel)
**No structural change.** It already checks for an existing session and routes to `user-home`. Keep that logic — the questionnaire check happens at login/signup, not at the carousel.

### `app/select-categories.tsx`
**Change:** Pre-populate with suggestions from AsyncStorage if available.

On mount, before showing the category grid:
```typescript
const stored = await AsyncStorage.getItem('ZAPH_SUGGESTED_CATEGORIES')
if (stored) {
  const suggested: SuggestedCategory[] = JSON.parse(stored)
  setSelected(suggested.map(s => s.id))  // pre-select the 3 suggested
}
```

The UI is unchanged — user still sees the full 10-category grid, but their 3 are pre-selected. They can swap freely.

The **header text** changes to: "We've picked these for you — adjust if needed."
The **counter** still shows "X / N selected".

### `app/tasks-confirmation.tsx`
**Change:** After admin calls `compute_circle_assignments`, re-fetch categories to display the `is_common` labels.

Add to the existing member category display:
- Categories with `is_common = true` show a small "Circle" pill (bg: `Colors.bg.card`, border: 1px `Colors.brand.green`, text: secondary color, size 11)
- Categories with `is_common = false` show a small "Yours" pill (same style, no border)

Also show the daily task count after algorithm runs:
```
"Your circle will do [N] tasks per day"
```
Display this between the member list and the admin CTA button.

**Admin CTA flow (new two-step):**
1. First button: "Assign categories" (secondary dark button) → calls `compute_circle_assignments` RPC → refreshes display with is_common labels + daily task count
2. Second button (appears after assignment): "Start the week" (green CTA) → calls `start_circle_week` RPC → navigates to circle-home

For non-admins: show "Waiting for [admin name] to assign categories…" first, then "Waiting for [admin name] to start the week…" after assignment.

Poll for `circles.stage = 'active'` every 2000ms as before.

### `app/circle-home.tsx` and `app/user-home.tsx`
**Change:** The `daily_task_count` on the circle now determines how many subtasks the user sees per day.

When fetching subtasks for a circle, respect `circles.daily_task_count`:
```typescript
// After fetching circle data (which includes daily_task_count):
const taskLimit = circleData.daily_task_count ?? 6

// Distribute across categories:
// taskLimit ÷ 3 categories = tasks per category per day
const tasksPerCategory = Math.floor(taskLimit / 3)

// Show only tasksPerCategory subtasks per category
// Prefer the ones from ZAPH_SUGGESTED_CATEGORIES stored in AsyncStorage
```

---

## AsyncStorage Keys (add to your constants file)

```typescript
// Add to src/constants/storage.ts (create if doesn't exist)
export const STORAGE_KEYS = {
  SESSION:                'ZAPH_SESSION',
  CIRCLE_ID:              'ZAPH_CIRCLE_ID',
  CIRCLE_CODE:            'ZAPH_CIRCLE_CODE',
  CIRCLE_DIFFICULTY:      'ZAPH_CIRCLE_DIFFICULTY',
  CIRCLE_NAME:            'ZAPH_CIRCLE_NAME',
  FIRST_NAME:             'ZAPH_FIRST_NAME',
  MOTIVATION_TIER:        'ZAPH_MOTIVATION_TIER',
  SUGGESTED_CATEGORIES:   'ZAPH_SUGGESTED_CATEGORIES',  // JSON string of SuggestedCategory[]
}
```

---

## Screen Transition — Questionnaire UX Details

**The questionnaire must feel smooth and intentional, not like a form:**

- Questions slide in from the right (or fade) — use `Animated` with `useNativeDriver: true`
- Each question page fills the whole screen — no scrolling unless options overflow
- Auto-advance (single pick) should have a 180ms delay before advancing so the green selection state is visible briefly
- Progress bar animates smoothly with `Animated.timing`, not a jump
- The Q7 slider number should animate with `Animated` — spring when the value changes

**Do NOT:**
- Show all questions at once (it's one question per screen)
- Use a tab or wizard UI — this should feel conversational
- Use a FlatList or ScrollView with all questions rendered — use conditional rendering based on `step`

---

## Rules — Do Not Break These

### Design
- Theme must not change: black base, dark card surfaces, green CTA only
- All colors from `src/constants/design.ts` — zero hardcoded hex values
- All spacing from `src/constants/design.ts` — no magic numbers
- `text.hero` (72px) reserved for the Q7 confidence number only — do not reuse elsewhere
- Option buttons: height 58, radius `Radius.cardSm`, full width — consistent across all questions

### Code
- TypeScript strict: zero `any`, no unused imports, no unused vars
- Every new screen: loading state + error state — no exceptions
- No file over 300 lines — extract `useQuestionnaire` hook if questionnaire.tsx grows large
- All Supabase calls in `useEffect` or event handlers, never in render
- `questionnaire.tsx` and `category-suggestion.tsx` must use `export default`

### What Not to Touch
- `src/lib/supabase.ts`
- `src/constants/design.ts`
- `src/components/TabBar.tsx`
- `src/components/LeaderboardWidget.tsx`
- `app/callback/callback.tsx`
- `app/settings.tsx`
- `app/welcome.tsx`

---

## Implementation Order

1. Create `src/constants/storage.ts` (AsyncStorage key constants)
2. Create `src/types/questionnaire.ts`
3. Create `src/lib/questionnaire.ts` (scoring functions)
4. Create `app/questionnaire.tsx`
5. Create `app/category-suggestion.tsx`
6. Modify `app/create-account.tsx` (redirect to questionnaire)
7. Modify `app/signup.tsx` (check questionnaire_completed on login)
8. Modify `app/select-categories.tsx` (pre-populate from AsyncStorage)
9. Modify `app/tasks-confirmation.tsx` (two-step admin flow + is_common labels)
10. Modify `app/circle-home.tsx` + `app/user-home.tsx` (respect daily_task_count)
11. Run `npx tsc --noEmit` — fix ALL type errors before testing on device

---
