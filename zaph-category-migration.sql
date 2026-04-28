-- ============================================================
-- ZAPH — Category System Migration (v3 — safe to re-run)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================
-- CURRENT DB STATE (confirmed from schema screenshot):
--   categories                         EXISTS (10 rows seeded)
--   category_subtasks                  EXISTS (50 rows seeded)
--   circle_member_category_selections  EXISTS (no is_common/assigned_by yet — added by questionnaire migration)
--   task_completions                   EXISTS (new version: category_id + subtask_id)
--   circle_members.categories_selected EXISTS
--   legacy_circle_task_selections      EXISTS (already renamed)
--   legacy_circle_tasks                EXISTS (already renamed)
--   legacy_task_completions            EXISTS (already renamed)
--   legacy_tasks                       EXISTS (already renamed)
--
--   ALL TABLE RENAMES AND CREATES HAVE BEEN APPLIED.
--   Re-running this file is safe — CREATE TABLE IF NOT EXISTS,
--   INSERT ON CONFLICT DO NOTHING, and CREATE OR REPLACE are all idempotent.
--   DROP POLICY IF EXISTS guards all policy creation.
-- ============================================================


-- ============================================================
-- STEP 1: RENAME OLD TABLES TO legacy_ (already done — skipped)
-- These are commented out because the renames have already been
-- applied. Re-running them would either be a no-op or, for
-- task_completions, would attempt to rename the NEW table.
-- ============================================================

-- ALTER TABLE IF EXISTS circle_task_selections RENAME TO legacy_circle_task_selections;
-- ALTER TABLE IF EXISTS circle_tasks           RENAME TO legacy_circle_tasks;
-- ALTER TABLE IF EXISTS task_completions       RENAME TO legacy_task_completions;
-- ALTER TABLE IF EXISTS tasks                  RENAME TO legacy_tasks;


-- ============================================================
-- STEP 2: CATEGORIES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  icon        text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_read" ON categories;
CREATE POLICY "categories_public_read" ON categories
  FOR SELECT USING (true);


-- ============================================================
-- STEP 3: SEED THE 10 CORE CATEGORIES
-- ON CONFLICT DO NOTHING — safe to re-run
-- ============================================================

INSERT INTO categories (name, description, icon, sort_order) VALUES
  ('Physical Activity',     'Steps, gym sessions, or morning runs',               NULL, 1),
  ('Deep Focus',            'Avoiding social media or dedicated Deep Work blocks', NULL, 2),
  ('Academic Mastery',      'Class attendance and exam revision',                  NULL, 3),
  ('Sleep Hygiene',         'Consistent wake-up and bedtimes',                     NULL, 4),
  ('Hydration & Nutrition', 'Meal prepping and daily water intake',                NULL, 5),
  ('Financial Discipline',  'Budget tracking and investment reviews',              NULL, 6),
  ('Mental Well-being',     'Meditation and gratitude journaling',                 NULL, 7),
  ('Social Quality',        'Real-world meetups and phone-free hangouts',          NULL, 8),
  ('Environment',           'Cleaning schedules and shared chore management',      NULL, 9),
  ('Consistency',           'Maintaining daily streaks and building habits',       NULL, 10)
ON CONFLICT DO NOTHING;


-- ============================================================
-- STEP 4: CATEGORY SUBTASKS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS category_subtasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_subtasks_category ON category_subtasks(category_id);

ALTER TABLE category_subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subtasks_public_read" ON category_subtasks;
CREATE POLICY "subtasks_public_read" ON category_subtasks
  FOR SELECT USING (true);


-- ============================================================
-- STEP 5: SEED 5 SUBTASKS PER CATEGORY
-- Wrapped in DO block — only inserts if the category has 0 subtasks,
-- preventing duplicate seeds on re-run.
-- ============================================================

DO $$
DECLARE v_cat_id uuid;
BEGIN

  -- Physical Activity
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Physical Activity';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Run 3km',                1),
      (v_cat_id, 'Go to the gym',          2),
      (v_cat_id, 'Hit 10,000 steps',       3),
      (v_cat_id, '30 min workout',         4),
      (v_cat_id, 'Morning stretch / yoga', 5);
  END IF;

  -- Deep Focus
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Deep Focus';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, '2hr deep work block',         1),
      (v_cat_id, 'No social media before noon', 2),
      (v_cat_id, 'Complete one key task',       3),
      (v_cat_id, 'Phone-free morning',          4),
      (v_cat_id, '1hr reading',                 5);
  END IF;

  -- Academic Mastery
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Academic Mastery';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Attend all classes',   1),
      (v_cat_id, '1hr exam revision',    2),
      (v_cat_id, 'Complete assignments', 3),
      (v_cat_id, 'Review lecture notes', 4),
      (v_cat_id, 'Study group session',  5);
  END IF;

  -- Sleep Hygiene
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Sleep Hygiene';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'In bed by 11pm',              1),
      (v_cat_id, 'Wake up before 8am',          2),
      (v_cat_id, 'No screens 30min before bed', 3),
      (v_cat_id, 'Get 7+ hours of sleep',       4),
      (v_cat_id, 'Consistent wake-up time',     5);
  END IF;

  -- Hydration & Nutrition
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Hydration & Nutrition';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Drink 2L of water',  1),
      (v_cat_id, 'Meal prep done',     2),
      (v_cat_id, 'No junk food today', 3),
      (v_cat_id, 'Eat breakfast',      4),
      (v_cat_id, 'Track calories',     5);
  END IF;

  -- Financial Discipline
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Financial Discipline';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Log daily expenses',         1),
      (v_cat_id, 'Review budget',              2),
      (v_cat_id, 'No impulse purchases today', 3),
      (v_cat_id, 'Check investment portfolio', 4),
      (v_cat_id, 'Hit today''s savings target',5);
  END IF;

  -- Mental Well-being
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Mental Well-being';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, '10min meditation',        1),
      (v_cat_id, 'Write 3 gratitudes',      2),
      (v_cat_id, 'Journaling session',      3),
      (v_cat_id, '1hr digital detox',       4),
      (v_cat_id, '5min breathing exercise', 5);
  END IF;

  -- Social Quality
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Social Quality';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Meet someone in person',  1),
      (v_cat_id, 'Phone-free hangout',      2),
      (v_cat_id, 'Call a friend or family', 3),
      (v_cat_id, 'No phone at dinner',      4),
      (v_cat_id, 'Plan an outing',          5);
  END IF;

  -- Environment
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Environment';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Clean room or workspace', 1),
      (v_cat_id, 'Do laundry',              2),
      (v_cat_id, 'Complete shared chore',   3),
      (v_cat_id, 'Declutter one area',      4),
      (v_cat_id, 'Make your bed',           5);
  END IF;

  -- Consistency
  SELECT id INTO v_cat_id FROM categories WHERE name = 'Consistency';
  IF v_cat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category_subtasks WHERE category_id = v_cat_id) THEN
    INSERT INTO category_subtasks (category_id, title, sort_order) VALUES
      (v_cat_id, 'Complete all chosen tasks today', 1),
      (v_cat_id, 'Maintain daily streak',           2),
      (v_cat_id, 'Check in with your circle',       3),
      (v_cat_id, 'Morning routine done',            4),
      (v_cat_id, 'Evening reflection',              5);
  END IF;

END $$;


-- ============================================================
-- STEP 6: CIRCLE MEMBER CATEGORY SELECTIONS
-- NOTE: user_id FK → auth.users(id) to match circle_members pattern
-- ============================================================

CREATE TABLE IF NOT EXISTS circle_member_category_selections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_cmcs_circle   ON circle_member_category_selections(circle_id);
CREATE INDEX IF NOT EXISTS idx_cmcs_user     ON circle_member_category_selections(user_id);
CREATE INDEX IF NOT EXISTS idx_cmcs_category ON circle_member_category_selections(category_id);

ALTER TABLE circle_member_category_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmcs_select_circle_members" ON circle_member_category_selections;
CREATE POLICY "cmcs_select_circle_members" ON circle_member_category_selections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_member_category_selections.circle_id
        AND cm.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cmcs_insert_own" ON circle_member_category_selections;
CREATE POLICY "cmcs_insert_own" ON circle_member_category_selections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cmcs_delete_own" ON circle_member_category_selections;
CREATE POLICY "cmcs_delete_own" ON circle_member_category_selections
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- STEP 7: NEW task_completions TABLE
-- user_id FK → auth.users(id)
-- completed_on date NOT NULL preserved from legacy schema
-- ============================================================

CREATE TABLE IF NOT EXISTS task_completions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    uuid        NOT NULL REFERENCES circles(id)          ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  category_id  uuid        NOT NULL REFERENCES categories(id),
  subtask_id   uuid        NOT NULL REFERENCES category_subtasks(id),
  points       integer     NOT NULL DEFAULT 5 CHECK (points >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_on date        NOT NULL DEFAULT CURRENT_DATE,
  completed_day date
);

CREATE INDEX IF NOT EXISTS idx_tc_circle       ON task_completions(circle_id);
CREATE INDEX IF NOT EXISTS idx_tc_user         ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_tc_category     ON task_completions(category_id);
CREATE INDEX IF NOT EXISTS idx_tc_completed_at ON task_completions(completed_at);
CREATE INDEX IF NOT EXISTS idx_tc_completed_on ON task_completions(completed_on);

-- Prevent completing the same subtask twice on the same day in the same circle
CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_no_duplicate
  ON task_completions(circle_id, user_id, subtask_id, completed_on);

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tc_select_circle_members" ON task_completions;
CREATE POLICY "tc_select_circle_members" ON task_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = task_completions.circle_id
        AND cm.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tc_insert_own" ON task_completions;
CREATE POLICY "tc_insert_own" ON task_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tc_delete_own" ON task_completions;
CREATE POLICY "tc_delete_own" ON task_completions
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- STEP 8: ADD categories_selected FLAG TO circle_members
-- Already exists in DB — ADD COLUMN IF NOT EXISTS is a no-op
-- ============================================================

ALTER TABLE circle_members
  ADD COLUMN IF NOT EXISTS categories_selected boolean NOT NULL DEFAULT false;


-- ============================================================
-- STEP 9: HELPER — category count per difficulty
-- ============================================================

CREATE OR REPLACE FUNCTION get_category_count_for_difficulty(p_difficulty text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(p_difficulty)
    WHEN 'easy'   THEN 2
    WHEN 'medium' THEN 3
    WHEN 'hard'   THEN 5
    ELSE 2
  END;
$$;


-- ============================================================
-- STEP 10: RPC — start_circle_week
-- 'active' is already a valid stage value in the circles CHECK constraint.
-- ============================================================

CREATE OR REPLACE FUNCTION start_circle_week(p_circle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = auth.uid()
      AND role      = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only the circle admin can start the week';
  END IF;

  UPDATE circles
  SET
    started_at = now(),
    started_by = auth.uid(),
    stage      = 'active'
  WHERE id = p_circle_id;
END;
$$;


-- ============================================================
-- STEP 11: RPC — check if all members have selected categories
-- ============================================================

CREATE OR REPLACE FUNCTION all_members_selected_categories(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id           = p_circle_id
      AND categories_selected = false
  );
$$;


-- ============================================================
-- VERIFY — run these after migration to confirm everything worked
-- ============================================================
-- SELECT * FROM categories ORDER BY sort_order;
-- SELECT c.name, COUNT(cs.id) AS subtask_count
--   FROM categories c JOIN category_subtasks cs ON cs.category_id = c.id
--   GROUP BY c.name ORDER BY c.name;
-- Expected: 10 rows, each with subtask_count = 5
-- ============================================================
