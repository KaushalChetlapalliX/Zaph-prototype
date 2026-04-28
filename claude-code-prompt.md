# Claude Code Prompt — Zaph Category System

Paste everything below this line into Claude Code.

---

## Before You Write a Single Line of Code — Read These Files First

You MUST read all of the following files before doing anything else. They define the rules you cannot break:

```
CLAUDE.md
.claude/rules/code-style.md
.claude/rules/design.md
.claude/rules/impeccable.md
.claude/rules/security.md
```

Run this in your shell to read them all at once:
```bash
cat CLAUDE.md .claude/rules/code-style.md .claude/rules/design.md .claude/rules/impeccable.md .claude/rules/security.md
```

Also read `src/constants/design.ts` — this is the single source of truth for every color, spacing value, radius, and typography style. **Every value in every new or modified file must come from this file. No hardcoded hex values. No magic numbers.**

Do not proceed until you have read all of these.

---

## Context

You are working on **Zaph**, a gamified social accountability app built with Expo Router v6, React Native 0.81, React 19, TypeScript strict mode, and Supabase.

The project is at `/Users/kaushalchetlapalli/zaph-prototype`.

**We have just run a Supabase migration** that replaced the old task-selection system with a category-based system. The migration has already been applied to the database. Your job is to update the frontend to match.

**The visual design and theme must not change.** The app uses a pure dark theme (black base, dark card surfaces, green CTA, accent colors for gamification only). Any screen you create or modify must be visually indistinguishable in style from the existing screens. If you are unsure about a visual decision, look at `app/user-home.tsx` or `app/circle-home.tsx` as your reference for how screens should look and feel.

---

## Real Database Schema (verified)

### Tables that still exist and are unchanged:
```
profiles:        id (uuid PK), username, created_at, first_name, last_name, full_name, display_name
circles:         id (uuid PK), code, difficulty, created_by, created_at, name, started_at, started_by
                 stage CHECK: ('lobby', 'selecting', 'loading', 'confirm', 'active')
circle_members:  (circle_id, user_id) composite PK
                 role CHECK: ('admin', 'member')
                 joined_at, display_name, tasks_done (bool), first_name, last_name
                 *** NEW COLUMN: categories_selected boolean NOT NULL DEFAULT false ***
                 user_id FK → auth.users(id)
```

### Old tables renamed (DO NOT USE — kept as backup only):
```
legacy_tasks
legacy_circle_tasks
legacy_circle_task_selections
legacy_task_completions
```

### New tables (created by migration):
```
categories:
  id (uuid PK), name, description, icon (emoji text), sort_order, is_active, created_at

category_subtasks:
  id (uuid PK), category_id (FK → categories), title, sort_order, created_at

circle_member_category_selections:
  id (uuid PK), circle_id (FK → circles), user_id (FK → auth.users),
  category_id (FK → categories), created_at
  UNIQUE (circle_id, user_id, category_id)

task_completions:  ← rebuilt, same name as old table
  id (uuid PK), circle_id (FK → circles), user_id (FK → auth.users),
  category_id (FK → categories), subtask_id (FK → category_subtasks),
  points (int DEFAULT 5), completed_at (timestamptz), completed_on (date NOT NULL DEFAULT CURRENT_DATE),
  completed_day (date)
  UNIQUE INDEX on (circle_id, user_id, subtask_id, completed_on) — no duplicate completions per day
```

### New RPCs:
- `start_circle_week(p_circle_id uuid)` — admin only. Sets `circles.stage = 'active'`, `started_at = now()`, `started_by = auth.uid()`.
- `all_members_selected_categories(p_circle_id uuid)` — returns boolean. True when every `circle_members` row for that circle has `categories_selected = true`.
- `get_category_count_for_difficulty(p_difficulty text)` — returns 2 for easy, 3 for medium, 5 for hard.

### Existing RPCs (unchanged):
- `create_circle_with_code(difficulty, desired_code, circle_name)` — returns `{ out_circle_id, out_code }`
- `join_circle(code)` — returns `circle_id`
- `set_circle_stage(p_circle_id, p_stage)` — unchanged. Valid stage values: `'lobby'`, `'selecting'`, `'loading'`, `'confirm'`, `'active'`

### Circle stage flow (new, simplified):
```
lobby → selecting → active
```
The stages `'loading'` and `'confirm'` are no longer used in the new flow but remain valid in the DB constraint.

---

## How the New System Works

**Difficulty → number of categories each user must pick:**
- Easy: 2 categories
- Medium: 3 categories
- Hard: 5 categories

**The 10 categories** (already seeded in DB):
Physical Activity, Deep Focus, Academic Mastery, Sleep Hygiene,
Hydration & Nutrition, Financial Discipline, Mental Well-being,
Social Quality, Environment, Consistency

**Each category has 5 preset subtasks** in `category_subtasks`.
When a user selects a category, all 5 of its subtasks become their tasks for the week. No custom tasks in this version.

**Completing a task:**
Completing any subtask inserts a row into `task_completions` with `category_id` + `subtask_id`. Points = 5 per completion. The unique index prevents completing the same subtask twice in one day in the same circle.

**Shared categories:**
If multiple members in a circle pick the same category, it's "shared." No special DB record for this — compute it by counting `circle_member_category_selections` where `category_id` appears for multiple users in the same circle. Everyone earns points independently. No special behavior beyond a visual badge in the confirmation screen.

**Leaderboard:**
Total points = `SUM(task_completions.points)` per user in a circle for the current week (UTC Monday 00:00 → Sunday 23:59). Same logic as before, same table name. Just the source columns changed.

---

## Files to Create

### `app/select-categories.tsx` (NEW SCREEN — replaces select-tasks.tsx)

**Route params:** `circleId` (string), `difficulty` (string: 'easy' | 'medium' | 'hard')

**Behavior:**
1. On mount: call `get_category_count_for_difficulty(difficulty)` via RPC, or derive it client-side (easy=2, medium=3, hard=5). Fetch all categories from `categories` table ordered by `sort_order`. Also fetch existing `circle_member_category_selections` for this user+circle to handle "resuming."
2. Display a 2-column grid of all 10 category cards.
3. Each card: large emoji (32px), category name (`text.section` style), description (`text.label`, secondary color). Card bg = `Colors.bg.card` (#1C1C1E). Selected state = 2px border in `Colors.brand.greenBright` (#39D353).
4. Header shows: "Choose your categories" and a counter "X / N selected" where N is the difficulty limit.
5. Once limit is reached, additional taps are ignored (no new selections). Selected cards can be deselected.
6. "Confirm" CTA button (primary green, full width, fixed at bottom) — disabled until exactly N categories are selected.
7. On confirm:
   - Delete existing selections: `supabase.from('circle_member_category_selections').delete().eq('circle_id', circleId).eq('user_id', uid)`
   - Insert new: `supabase.from('circle_member_category_selections').insert(selectedIds.map(categoryId => ({ circle_id: circleId, user_id: uid, category_id: categoryId })))`
   - Update member flag: `supabase.from('circle_members').update({ categories_selected: true }).eq('circle_id', circleId).eq('user_id', uid)`
   - Navigate to `loading` screen passing `circleId`

**Loading state:** ActivityIndicator while fetching categories.
**Error state:** Inline error text if fetch fails.
**TypeScript:** No `any`. Use the `Category` type defined in `src/types/categories.ts`.

---

## Files to Modify

### `app/onboarding.tsx` — text changes only

Update the description text on each difficulty card:
- Easy: `"2 categories · Casual pace"`
- Medium: `"3 categories · Steady commitment"`
- Hard: `"5 categories · Full send"`

No logic changes.

---

### `app/circle-members.tsx`

**One change:** When stage changes to `'selecting'`, navigate to `/(app)/select-categories` instead of `/(app)/select-tasks`. Pass `circleId` and `difficulty` as route params.

The admin "Start" button (which calls `set_circle_stage(circleId, 'selecting')`) is unchanged in logic.

**Also:** if there's any reference to `tasks_done` column for navigation logic, keep it as-is or replace with `categories_selected` if it's being checked for something. Do not remove `tasks_done` from DB queries — just don't rely on it for new navigation.

---

### `app/loading.tsx`

**Replace the poll logic:**

Old: polled `circle_task_selections` and `tasks_done` column.

New:
```typescript
// Poll every 2000ms:
const { data: members } = await supabase
  .from('circle_members')
  .select('user_id, categories_selected')
  .eq('circle_id', circleId)

const ready = members?.filter(m => m.categories_selected).length ?? 0
const total = members?.length ?? 0

// All ready when ready === total && total > 0
// Then navigate to tasks-confirmation
```

Display: "X / Y members ready" using the ready/total counts above.

---

### `app/tasks-confirmation.tsx` — rewrite the data logic, keep the layout structure

**Old logic:** fetched `circle_tasks` + `legacy_tasks`, admin called `finalize_circle_tasks`.
**New logic:**

1. Fetch each member's selected categories:
```typescript
const { data } = await supabase
  .from('circle_member_category_selections')
  .select('user_id, category_id, categories(id, name, icon)')
  .eq('circle_id', circleId)
```

2. Fetch circle member names:
```typescript
const { data: members } = await supabase
  .from('circle_members')
  .select('user_id, first_name, role')
  .eq('circle_id', circleId)
```

3. Group selections by user_id. For each member: show their first_name + their category pills (icon + name).

4. Find shared categories: `category_id` values that appear for more than one user. Add a small "Shared" text label on those category pills.

5. Admin sees a green "Start the week" CTA. On press: call `supabase.rpc('start_circle_week', { p_circle_id: circleId })`. On success: navigate to `circle-home` passing `circleId`.

6. Non-admins see: "Waiting for [admin's first_name] to start…" — pulse animation on the text.

7. Poll for `circles.stage = 'active'` every 2000ms. When active, auto-navigate all members to `circle-home`.

---

### `app/user-home.tsx` — update data fetching and completion logic

**Old:** fetched `circle_tasks` + `legacy_tasks`, inserted into old `task_completions` with `task_id`.

**New fetch logic:**
```typescript
// 1. Get user's circles (unchanged)
const { data: memberships } = await supabase
  .from('circle_members')
  .select('circle_id, circles(id, name, code)')
  .eq('user_id', uid)

const circleIds = memberships.map(m => m.circle_id)

// 2. Get category selections per circle for this user
const { data: selections } = await supabase
  .from('circle_member_category_selections')
  .select('circle_id, category_id')
  .eq('user_id', uid)
  .in('circle_id', circleIds)

const categoryIds = [...new Set(selections.map(s => s.category_id))]

// 3. Get subtasks for selected categories
const { data: subtasks } = await supabase
  .from('category_subtasks')
  .select('id, category_id, title, sort_order')
  .in('category_id', categoryIds)
  .order('sort_order')

// 4. Get today's completions
const todayStart = startOfDayLocal()   // existing helper
const todayEnd   = endOfDayLocal()     // existing helper or compute inline
const { data: completions } = await supabase
  .from('task_completions')
  .select('subtask_id, circle_id, category_id, completed_on')
  .eq('user_id', uid)
  .in('circle_id', circleIds)
  .eq('completed_on', new Date().toISOString().slice(0, 10))  // 'YYYY-MM-DD'
```

**Display:** Group subtasks by category. Show category name + icon as a section header row, then the 5 subtasks below. Mark each subtask done if there's a matching `completions` row with the same `subtask_id`.

**On complete:**
```typescript
await supabase.from('task_completions').insert({
  circle_id:    circleId,
  user_id:      uid,
  category_id:  subtask.category_id,
  subtask_id:   subtask.id,
  points:       5,
  completed_at: new Date().toISOString(),
  completed_on: new Date().toISOString().slice(0, 10),
})
```

**Weekly points:** same query as before — `SUM(task_completions.points)` for user+circleIds within UTC week range.

---

### `app/circle-home.tsx` — update data fetching and completion logic

**Old:** fetched `circle_tasks` + `legacy_tasks`.

**New fetch logic** (for this specific circle):
```typescript
// 1. Get user's category selections for this circle
const { data: selections } = await supabase
  .from('circle_member_category_selections')
  .select('category_id, categories(id, name, icon)')
  .eq('circle_id', circleId)
  .eq('user_id', uid)

const categoryIds = selections.map(s => s.category_id)

// 2. Get subtasks for those categories
const { data: subtasks } = await supabase
  .from('category_subtasks')
  .select('id, category_id, title, sort_order')
  .in('category_id', categoryIds)
  .order('sort_order')

// 3. Today's completions for this circle
const { data: todayDone } = await supabase
  .from('task_completions')
  .select('subtask_id, category_id')
  .eq('circle_id', circleId)
  .eq('user_id', uid)
  .eq('completed_on', new Date().toISOString().slice(0, 10))
```

**Leaderboard data** (for LeaderboardWidget — unchanged query shape):
```typescript
const { data: allPoints } = await supabase
  .from('task_completions')
  .select('user_id, points, completed_at')
  .eq('circle_id', circleId)
  .gte('completed_at', weekStart)
  .lte('completed_at', weekEnd)
```
This is the same query as before — LeaderboardWidget does not need to change.

**Activity feed:**
```typescript
const { data: feed } = await supabase
  .from('task_completions')
  .select('id, user_id, category_id, subtask_id, completed_at')
  .eq('circle_id', circleId)
  .gte('completed_at', weekStart)
  .order('completed_at', { ascending: false })
  .limit(20)
```
For display: resolve `subtask_id` → title from your already-fetched subtasks. Resolve `category_id` → name from selections. Show: "[First Name] completed [subtask title] in [category name]".

**On complete:** same insert as user-home.tsx above.

**Remove:** all references to `legacy_circle_tasks`, `legacy_tasks`, `task_id`.

---

### `app/leaderboard.tsx` — verify only, likely no changes

The leaderboard queries `task_completions` for `user_id` and `points`. The new `task_completions` table still has both columns. Run `npx tsc --noEmit` and check for type errors. If the select shape still matches, no changes are needed.

---

## TypeScript Types — create `src/types/categories.ts`

```typescript
export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface CategorySubtask {
  id: string;
  category_id: string;
  title: string;
  sort_order: number;
}

export interface CircleMemberCategorySelection {
  id: string;
  circle_id: string;
  user_id: string;
  category_id: string;
  created_at: string;
}

export interface TaskCompletion {
  id: string;
  circle_id: string;
  user_id: string;
  category_id: string;
  subtask_id: string;
  points: number;
  completed_at: string;
  completed_on: string;   // 'YYYY-MM-DD'
  completed_day?: string;
}
```

---

## Rules — do not break these

### Design & Theme (CRITICAL — the visual identity must not change)
- The theme is pure dark: `#000000` screen background, `#1C1C1E` cards. Do not introduce any light backgrounds, white cards, or grey surfaces anywhere.
- Every color must come from `src/constants/design.ts`. Zero hardcoded hex values — not even `#000000` or `#FFFFFF` inline. Import the constants.
- Every spacing value must come from `src/constants/design.ts`. No magic numbers in StyleSheet.
- The green CTA (`Colors.brand.green`) is used for exactly ONE primary action per screen. Secondary buttons use `Colors.bg.card`.
- Progress bars always use the gradient defined in `design.ts` — never a solid color fill.
- New screens must follow the exact screen structure from `impeccable.md`: SafeAreaView → header row → ScrollView/FlatList → optional fixed bottom element.
- Card radius = `Radius.card` (16) or `Radius.cardSm` (12) for grid items. Never a custom value.
- Typography: use only the text style sizes and weights defined in `design.ts`. Never set `fontSize` or `fontWeight` as one-off inline values.

### Code Quality
- TypeScript strict mode: zero `any`, no unused imports, no unused variables
- Every screen that fetches data must show a loading state AND an error state — no blank screens
- No screen file over 300 lines — extract a custom hook if it grows beyond that
- `select-categories.tsx` must use `export default` (Expo Router requirement)
- All Supabase calls go in `useEffect` or event handlers — never in render logic
- Comment the "why" not the "what" — especially on non-obvious Supabase queries

### What Not to Touch
- Do NOT modify: `app/callback/callback.tsx`, `app/create-account.tsx`, `app/signup.tsx`, `app/welcome.tsx`, `app/settings.tsx`
- Do NOT modify: `src/lib/supabase.ts`, `src/constants/design.ts`, `src/components/TabBar.tsx`
- Do NOT modify: `src/components/LeaderboardWidget.tsx` — the leaderboard widget receives the same data shape as before
- Do NOT reference the `legacy_*` tables from any frontend code — they are backup only
- Do NOT install new npm packages without explicit confirmation (New Architecture compatibility is sensitive)

---

## Implementation Order

1. Create `src/types/categories.ts`
2. Create `app/select-categories.tsx`
3. Modify `app/onboarding.tsx` (text only)
4. Modify `app/circle-members.tsx` (navigation destination change)
5. Modify `app/loading.tsx` (poll query change)
6. Modify `app/tasks-confirmation.tsx` (new data + new RPC)
7. Modify `app/user-home.tsx` (new data model)
8. Modify `app/circle-home.tsx` (new data model)
9. Verify `app/leaderboard.tsx`
10. Run `npx tsc --noEmit` — fix all type errors before testing on device

---

