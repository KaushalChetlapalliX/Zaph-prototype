-- ============================================================
-- ZAPH — Questionnaire & Motivation Score Migration
-- Run AFTER zaph-category-migration.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================
-- CURRENT DB STATE (confirmed from schema screenshot):
--   profiles: HAS NO motivation_score / motivation_tier / questionnaire_completed
--   circles:  HAS NO daily_task_count
--   circle_member_category_selections: HAS NO is_common / assigned_by
--   user_questionnaire_responses: DOES NOT EXIST
--
--   THIS MIGRATION HAS NOT YET BEEN APPLIED — run it now.
--   All statements are idempotent:
--     ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--     CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS.
-- ============================================================
-- WHAT THIS ADDS:
--   1. profiles: motivation_score, motivation_tier, questionnaire_completed fields
--   2. user_questionnaire_responses: stores every answer per user
--   3. circle_member_category_selections: is_common + assigned_by columns
--   4. circles: daily_task_count column
--   5. RLS policies for questionnaire_responses
--   6. RPC: compute_and_save_motivation_score()
--   7. RPC: compute_circle_assignments(p_circle_id)
-- ============================================================


-- ============================================================
-- STEP 1: ADD QUESTIONNAIRE FIELDS TO profiles
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS motivation_score           numeric(3,2),
  ADD COLUMN IF NOT EXISTS motivation_tier            text
    CHECK (motivation_tier IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS questionnaire_completed    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS questionnaire_completed_at timestamptz;


-- ============================================================
-- STEP 2: USER QUESTIONNAIRE RESPONSES TABLE
-- One row per user per question_key per answer_value.
-- Multi-pick questions (Q4 last_week_wish) store multiple rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_questionnaire_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_key text        NOT NULL,
  answer_value text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_key, answer_value)
);

-- question_key values used by the app:
--   'life_context'       → Q1 (single pick)
--   'primary_focus'      → Q2 (single pick)   strongest category signal
--   'blocker'            → Q3 (single pick)   feeds motivation score
--   'last_week_wish'     → Q4 (multi-pick, up to 2 rows)
--   'drill_down'         → Q5 (conditional, 1-2 answers)
--   'competitive_style'  → Q6 (single pick)   feeds motivation score
--   'confidence_score'   → Q7 (slider value stored as text '1'-'10')
--   'circle_intent'      → Q8 (routing only, still stored)

CREATE INDEX IF NOT EXISTS idx_uqr_user         ON user_questionnaire_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_uqr_question_key ON user_questionnaire_responses(user_id, question_key);

ALTER TABLE user_questionnaire_responses ENABLE ROW LEVEL SECURITY;

-- Users can only see and write their own responses
DROP POLICY IF EXISTS "uqr_select_own" ON user_questionnaire_responses;
CREATE POLICY "uqr_select_own" ON user_questionnaire_responses
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uqr_insert_own" ON user_questionnaire_responses;
CREATE POLICY "uqr_insert_own" ON user_questionnaire_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uqr_delete_own" ON user_questionnaire_responses;
CREATE POLICY "uqr_delete_own" ON user_questionnaire_responses
  FOR DELETE USING (auth.uid() = user_id);

-- Circle members can read each other's questionnaire responses
-- (needed so the algorithm can compute common categories)
DROP POLICY IF EXISTS "uqr_circle_members_read" ON user_questionnaire_responses;
CREATE POLICY "uqr_circle_members_read" ON user_questionnaire_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM circle_members cm1
      JOIN circle_members cm2 ON cm1.circle_id = cm2.circle_id
      WHERE cm1.user_id = auth.uid()
        AND cm2.user_id = user_questionnaire_responses.user_id
    )
  );


-- ============================================================
-- STEP 3: ADD COLUMNS TO circle_member_category_selections
-- ============================================================

ALTER TABLE circle_member_category_selections
  ADD COLUMN IF NOT EXISTS is_common   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_by text    NOT NULL DEFAULT 'user'
    CHECK (assigned_by IN ('user', 'algorithm'));


-- ============================================================
-- STEP 4: ADD daily_task_count TO circles
-- Default 6 (medium tier) until the algorithm sets it.
-- ============================================================

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS daily_task_count int NOT NULL DEFAULT 6;


-- ============================================================
-- STEP 5: RPC — compute_and_save_motivation_score
--
-- Called client-side after questionnaire is complete.
-- Reads Q3, Q6, Q7 answers for the current user.
-- Saves motivation_score + motivation_tier to profiles.
-- Returns the computed score (numeric 1.00–5.00).
--
-- Formula:
--   base        = confidence_score (1–10) / 2    → 0.5–5.0
--   blocker_mod = see CASE below                  → -1.0 to 0
--   compete_mod = see CASE below                  → -0.5 to +1.0
--   final       = CLAMP(base + mods, 1.0, 5.0)
--   tier: low (≤2.4) | medium (≤3.4) | high (>3.4)
-- ============================================================

CREATE OR REPLACE FUNCTION compute_and_save_motivation_score()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confidence  numeric := 5;
  v_blocker     text;
  v_competitive text;
  v_blocker_mod numeric := 0;
  v_compete_mod numeric := 0;
  v_final       numeric;
  v_tier        text;
BEGIN
  -- Q7: confidence slider (stored as text '1'–'10')
  SELECT answer_value::numeric INTO v_confidence
  FROM user_questionnaire_responses
  WHERE user_id      = auth.uid()
    AND question_key = 'confidence_score'
  LIMIT 1;
  v_confidence := COALESCE(v_confidence, 5);

  -- Q3: blocker
  SELECT answer_value INTO v_blocker
  FROM user_questionnaire_responses
  WHERE user_id      = auth.uid()
    AND question_key = 'blocker'
  LIMIT 1;

  v_blocker_mod := CASE v_blocker
    WHEN 'strong_start_fade'        THEN -0.5
    WHEN 'unpredictable_life'       THEN -0.5
    WHEN 'distracted'               THEN  0.0
    WHEN 'no_accountability'        THEN  0.0
    WHEN 'dont_know_where_to_start' THEN -1.0
    ELSE 0.0
  END;

  -- Q6: competitive style
  SELECT answer_value INTO v_competitive
  FROM user_questionnaire_responses
  WHERE user_id      = auth.uid()
    AND question_key = 'competitive_style'
  LIMIT 1;

  v_compete_mod := CASE v_competitive
    WHEN 'goes_hardest'       THEN  1.0
    WHEN 'fired_up_by_others' THEN  0.5
    WHEN 'quiet_competitor'   THEN  0.0
    WHEN 'needs_group_energy' THEN -0.5
    ELSE 0.0
  END;

  -- Final score: base (0.5–5) + modifiers, clamped 1–5
  v_final := GREATEST(1.0, LEAST(5.0, (v_confidence / 2.0) + v_blocker_mod + v_compete_mod));

  v_tier := CASE
    WHEN v_final <= 2.4 THEN 'low'
    WHEN v_final <= 3.4 THEN 'medium'
    ELSE 'high'
  END;

  UPDATE profiles
  SET
    motivation_score           = v_final,
    motivation_tier            = v_tier,
    questionnaire_completed    = true,
    questionnaire_completed_at = now()
  WHERE id = auth.uid();

  RETURN v_final;
END;
$$;


-- ============================================================
-- STEP 6: RPC — compute_circle_assignments
--
-- Called by the admin on the tasks-confirmation screen
-- after all members have confirmed their categories.
--
-- Does:
--   1. Finds 2 most popular categories across circle members
--      marks them is_common = true
--   2. For each member: their first non-common category
--      stays is_common = false (personal)
--   3. Computes average motivation across all members
--      sets circles.daily_task_count (4 / 6 / 9)
-- ============================================================

CREATE OR REPLACE FUNCTION compute_circle_assignments(p_circle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_motivation numeric;
  v_daily_tasks    int;
  v_common_cat_1   uuid;
  v_common_cat_2   uuid;
  v_member         record;
  v_personal_cat   uuid;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = auth.uid()
      AND role      = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only the circle admin can compute assignments';
  END IF;

  -- 1. Average motivation score across all members in circle
  SELECT AVG(p.motivation_score) INTO v_avg_motivation
  FROM circle_members cm
  JOIN profiles p ON p.id = cm.user_id
  WHERE cm.circle_id          = p_circle_id
    AND p.motivation_score IS NOT NULL;

  -- Map avg motivation to daily task count
  -- low (<=2.4) → 4 tasks | medium (<=3.4) → 6 tasks | high → 9 tasks
  v_daily_tasks := CASE
    WHEN v_avg_motivation <= 2.4 THEN 4
    WHEN v_avg_motivation <= 3.4 THEN 6
    ELSE 9
  END;

  -- 2. Find top 2 most-selected categories across the circle
  --    (tie-break by category_id for determinism)
  SELECT category_id INTO v_common_cat_1
  FROM circle_member_category_selections
  WHERE circle_id = p_circle_id
  GROUP BY category_id
  ORDER BY COUNT(*) DESC, category_id
  LIMIT 1;

  SELECT category_id INTO v_common_cat_2
  FROM circle_member_category_selections
  WHERE circle_id    = p_circle_id
    AND category_id != v_common_cat_1
  GROUP BY category_id
  ORDER BY COUNT(*) DESC, category_id
  LIMIT 1;

  -- 3. Update circles.daily_task_count
  UPDATE circles
  SET daily_task_count = v_daily_tasks
  WHERE id = p_circle_id;

  -- 4. Reset all selections: algorithm-assigned, not common
  UPDATE circle_member_category_selections
  SET assigned_by = 'algorithm',
      is_common   = false
  WHERE circle_id = p_circle_id;

  -- 5. Mark the two common categories
  UPDATE circle_member_category_selections
  SET is_common = true
  WHERE circle_id   = p_circle_id
    AND category_id IN (v_common_cat_1, v_common_cat_2);

  -- 6. For each member, ensure exactly 1 personal category exists
  FOR v_member IN
    SELECT DISTINCT user_id
    FROM circle_member_category_selections
    WHERE circle_id = p_circle_id
  LOOP
    SELECT category_id INTO v_personal_cat
    FROM circle_member_category_selections
    WHERE circle_id = p_circle_id
      AND user_id   = v_member.user_id
      AND is_common = false
    LIMIT 1;

    -- Edge case: all 3 of their picks matched the 2 common categories
    -- Force their last pick to be personal so they always have one
    IF v_personal_cat IS NULL THEN
      UPDATE circle_member_category_selections
      SET is_common = false
      WHERE id = (
        SELECT id
        FROM circle_member_category_selections
        WHERE circle_id   = p_circle_id
          AND user_id     = v_member.user_id
          AND category_id NOT IN (v_common_cat_1, v_common_cat_2)
        LIMIT 1
      );
    END IF;
  END LOOP;
END;
$$;


-- ============================================================
-- VERIFY — run after migration
-- ============================================================
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'profiles'
--     AND column_name IN ('motivation_score','motivation_tier','questionnaire_completed');
-- Expected: 3 rows
--
-- SELECT column_name
--   FROM information_schema.columns
--   WHERE table_name = 'circles' AND column_name = 'daily_task_count';
-- Expected: 1 row
--
-- SELECT column_name
--   FROM information_schema.columns
--   WHERE table_name = 'circle_member_category_selections'
--     AND column_name IN ('is_common', 'assigned_by');
-- Expected: 2 rows
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name = 'user_questionnaire_responses';
-- Expected: 1 row
-- ============================================================
