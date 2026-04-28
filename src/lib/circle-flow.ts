import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../constants/storage";
import { supabase } from "./supabase";
import {
  computeCategoryScores,
  computeMotivationScoreLocal,
  computeMotivationTierFromScore,
  dailyTaskCountForTier,
  getSuggestedSubtasks,
  getTopCategories,
} from "./questionnaire";
import type {
  MotivationTier,
  QuestionnaireResponses,
  SuggestedCategory,
} from "../types/questionnaire";

interface QuestionnaireResponseRow {
  answer_value: string;
  question_key: string;
}

interface CategoryRow {
  description: string;
  icon: string;
  id: string;
  name: string;
}

interface SelectionRow {
  categories:
    | Pick<CategoryRow, "id" | "name">
    | Pick<CategoryRow, "id" | "name">[]
    | null;
  category_id: string;
  user_id: string;
}

interface CircleMemberRow {
  user_id: string;
}

interface ProfileScoreRow {
  motivation_score?: number | null;
}

function rowsToResponses(
  rows: QuestionnaireResponseRow[],
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const row of rows) {
    if (!next[row.question_key]) next[row.question_key] = [];
    next[row.question_key].push(row.answer_value);
  }
  return next;
}

function toQuestionnaireShape(
  responses: Record<string, string[]>,
): QuestionnaireResponses {
  return {
    blocker: responses.blocker?.[0],
    circle_intent: responses.circle_intent?.[0],
    competitive_style: responses.competitive_style?.[0],
    confidence_score: responses.confidence_score?.[0],
    drill_down: responses.drill_down?.[0],
    last_week_wish: responses.last_week_wish,
    life_context: responses.life_context?.[0],
    primary_focus: responses.primary_focus?.[0],
  };
}

export async function loadSuggestedCategoriesForUser(
  userId: string,
): Promise<SuggestedCategory[]> {
  try {
    const cached = await AsyncStorage.getItem(
      STORAGE_KEYS.SUGGESTED_CATEGORIES,
    );
    if (cached) {
      const parsed = JSON.parse(cached) as SuggestedCategory[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore stale cache
  }

  const { data: responseRows, error: responseErr } = await supabase
    .from("user_questionnaire_responses")
    .select("question_key, answer_value")
    .eq("user_id", userId);

  if (responseErr || !responseRows || responseRows.length === 0) {
    throw new Error("Questionnaire responses were not found for this user.");
  }

  const responses = rowsToResponses(responseRows as QuestionnaireResponseRow[]);
  const scores = computeCategoryScores(responses);
  const topNames = getTopCategories(scores, 3);

  const { data: categoryRows, error: categoryErr } = await supabase
    .from("categories")
    .select("id, name, icon, description")
    .in("name", topNames);

  if (categoryErr || !categoryRows) {
    throw new Error(categoryErr?.message ?? "Could not load categories.");
  }

  const categoryList = categoryRows as CategoryRow[];
  const questionnaire = toQuestionnaireShape(responses);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("motivation_score")
    .eq("id", userId)
    .maybeSingle();

  const profile = (profileRow ?? null) as ProfileScoreRow | null;
  const motivationScore =
    typeof profile?.motivation_score === "number"
      ? profile.motivation_score
      : computeMotivationScoreLocal(
          Number(questionnaire.confidence_score ?? "5"),
          questionnaire.blocker,
          questionnaire.competitive_style,
        );
  const motivationTier = computeMotivationTierFromScore(motivationScore);

  const suggestions = topNames
    .map((name) => {
      const category = categoryList.find((row) => row.name === name);
      if (!category) return null;
      return {
        description: category.description,
        icon: category.icon,
        id: category.id,
        name: category.name,
        score: scores[name] ?? 0,
        suggestedSubtasks: getSuggestedSubtasks(
          name,
          questionnaire.drill_down ?? null,
          motivationTier,
        ),
      };
    })
    .filter((value): value is SuggestedCategory => value !== null);

  await AsyncStorage.setItem(
    STORAGE_KEYS.MOTIVATION_TIER,
    motivationTier satisfies MotivationTier,
  );
  await AsyncStorage.setItem(
    STORAGE_KEYS.SUGGESTED_CATEGORIES,
    JSON.stringify(suggestions),
  );

  return suggestions;
}

export async function syncCircleSelectionsForCurrentUser(
  circleId: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You need to be logged in to join a circle.");

  const { data: circleRow } = await supabase
    .from("circles")
    .select("stage")
    .eq("id", circleId)
    .maybeSingle();

  const stage = String(
    (circleRow as { stage?: string | null } | null)?.stage ?? "lobby",
  );
  if (stage !== "lobby") return;

  const { data: existingRows } = await supabase
    .from("circle_member_category_selections")
    .select("assigned_by")
    .eq("circle_id", circleId)
    .eq("user_id", userId);

  const hasAlgorithmAssignments = (existingRows ?? []).some((row) => {
    const typed = row as { assigned_by?: string | null };
    return typed.assigned_by === "algorithm";
  });
  if (hasAlgorithmAssignments) return;

  const suggestions = await loadSuggestedCategoriesForUser(userId);
  const categoryIds = Array.from(
    new Set(
      suggestions
        .slice(0, 3)
        .map((suggestion) => suggestion.id)
        .filter((value) => value.trim().length > 0),
    ),
  );

  if (categoryIds.length < 3) {
    throw new Error("We need 3 confirmed categories before joining a circle.");
  }

  const { error: deleteErr } = await supabase
    .from("circle_member_category_selections")
    .delete()
    .eq("circle_id", circleId)
    .eq("user_id", userId);

  if (deleteErr) throw new Error(deleteErr.message);

  const { error: insertErr } = await supabase
    .from("circle_member_category_selections")
    .insert(
      categoryIds.map((categoryId) => ({
        assigned_by: "user",
        category_id: categoryId,
        circle_id: circleId,
        is_common: false,
        user_id: userId,
      })),
    );

  if (insertErr) throw new Error(insertErr.message);

  const { error: memberErr } = await supabase
    .from("circle_members")
    .update({ categories_selected: true })
    .eq("circle_id", circleId)
    .eq("user_id", userId);

  if (memberErr) throw new Error(memberErr.message);
}

export async function assignCircleCategoriesFromQuestionnaire(
  circleId: string,
): Promise<number> {
  const { data: memberRows, error: memberErr } = await supabase
    .from("circle_members")
    .select("user_id")
    .eq("circle_id", circleId);

  if (memberErr || !memberRows || memberRows.length === 0) {
    throw new Error(memberErr?.message ?? "No members found for this circle.");
  }

  const members = memberRows as CircleMemberRow[];
  const userIds = members.map((member) => member.user_id);

  const { data: selectionRows, error: selectionErr } = await supabase
    .from("circle_member_category_selections")
    .select("user_id, category_id, categories(id, name)")
    .eq("circle_id", circleId)
    .in("user_id", userIds);

  if (selectionErr || !selectionRows) {
    throw new Error(selectionErr?.message ?? "Could not load category picks.");
  }

  const { data: responseRows, error: responseErr } = await supabase
    .from("user_questionnaire_responses")
    .select("user_id, question_key, answer_value")
    .in("user_id", userIds);

  if (responseErr || !responseRows) {
    throw new Error(
      responseErr?.message ?? "Could not load questionnaire responses.",
    );
  }

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, motivation_score")
    .in("id", userIds);

  const selections = selectionRows as SelectionRow[];
  const selectionNamesByUser: Record<string, { id: string; name: string }[]> =
    {};
  for (const selection of selections) {
    const category = Array.isArray(selection.categories)
      ? selection.categories[0]
      : selection.categories;
    if (!category) continue;
    if (!selectionNamesByUser[selection.user_id]) {
      selectionNamesByUser[selection.user_id] = [];
    }
    selectionNamesByUser[selection.user_id].push({
      id: category.id,
      name: category.name,
    });
  }

  const responseRowsByUser: Record<string, QuestionnaireResponseRow[]> = {};
  for (const row of responseRows as Array<
    QuestionnaireResponseRow & { user_id: string }
  >) {
    if (!responseRowsByUser[row.user_id]) responseRowsByUser[row.user_id] = [];
    responseRowsByUser[row.user_id].push({
      answer_value: row.answer_value,
      question_key: row.question_key,
    });
  }

  // Backfill any member missing selections by deriving top categories from
  // their questionnaire responses. Handles the race where a member navigated
  // past the lobby before syncCircleSelectionsForCurrentUser finished.
  const membersMissingSelections = members.filter(
    (m) => (selectionNamesByUser[m.user_id] ?? []).length < 3,
  );
  if (membersMissingSelections.length > 0) {
    const namesToLookup = new Set<string>();
    const topNamesByUser: Record<string, string[]> = {};
    for (const member of membersMissingSelections) {
      const responseMap = rowsToResponses(
        responseRowsByUser[member.user_id] ?? [],
      );
      const scoreMap = computeCategoryScores(responseMap);
      const topNames = getTopCategories(scoreMap, 3);
      topNamesByUser[member.user_id] = topNames;
      for (const name of topNames) namesToLookup.add(name);
    }

    if (namesToLookup.size > 0) {
      const { data: catRows } = await supabase
        .from("categories")
        .select("id, name")
        .in("name", Array.from(namesToLookup));

      const catByName: Record<string, { id: string; name: string }> = {};
      for (const row of (catRows ?? []) as Array<{
        id: string;
        name: string;
      }>) {
        catByName[row.name] = row;
      }

      for (const member of membersMissingSelections) {
        const existing = selectionNamesByUser[member.user_id] ?? [];
        const existingIds = new Set(existing.map((c) => c.id));
        const filled = [...existing];
        for (const name of topNamesByUser[member.user_id] ?? []) {
          const cat = catByName[name];
          if (cat && !existingIds.has(cat.id)) {
            filled.push(cat);
            existingIds.add(cat.id);
          }
          if (filled.length >= 3) break;
        }
        selectionNamesByUser[member.user_id] = filled;
      }
    }
  }

  const combinedScores: Record<string, number> = {};
  const scoresByUserAndCategory: Record<string, Record<string, number>> = {};

  for (const member of members) {
    const selectedCategories = selectionNamesByUser[member.user_id] ?? [];
    const responseMap = rowsToResponses(
      responseRowsByUser[member.user_id] ?? [],
    );
    const scoreMap = computeCategoryScores(responseMap);
    scoresByUserAndCategory[member.user_id] = {};

    for (const category of selectedCategories) {
      const score = scoreMap[category.name] ?? 0;
      scoresByUserAndCategory[member.user_id][category.id] = score;
      combinedScores[category.id] = (combinedScores[category.id] ?? 0) + score;
    }
  }

  const commonCategoryIds = Object.entries(combinedScores)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([categoryId]) => categoryId);

  if (commonCategoryIds.length < 2) {
    throw new Error("We need at least 2 shared categories to assign the week.");
  }

  const finalRows: Array<{
    assigned_by: "algorithm";
    category_id: string;
    circle_id: string;
    is_common: boolean;
    user_id: string;
  }> = [];

  for (const member of members) {
    const selectedCategories = selectionNamesByUser[member.user_id] ?? [];
    const personal = [...selectedCategories]
      .filter((category) => !commonCategoryIds.includes(category.id))
      .sort((a, b) => {
        const left = scoresByUserAndCategory[member.user_id]?.[a.id] ?? 0;
        const right = scoresByUserAndCategory[member.user_id]?.[b.id] ?? 0;
        return right - left || a.name.localeCompare(b.name);
      })[0];

    for (const categoryId of commonCategoryIds) {
      finalRows.push({
        assigned_by: "algorithm",
        category_id: categoryId,
        circle_id: circleId,
        is_common: true,
        user_id: member.user_id,
      });
    }

    if (personal) {
      finalRows.push({
        assigned_by: "algorithm",
        category_id: personal.id,
        circle_id: circleId,
        is_common: false,
        user_id: member.user_id,
      });
    }
  }

  const scoresByUser = new Map<string, number>();
  for (const row of (profileRows ?? []) as Array<{
    id: string;
    motivation_score?: number | null;
  }>) {
    if (typeof row.motivation_score === "number") {
      scoresByUser.set(row.id, row.motivation_score);
    }
  }

  for (const member of members) {
    if (scoresByUser.has(member.user_id)) continue;
    const responseMap = rowsToResponses(
      responseRowsByUser[member.user_id] ?? [],
    );
    const questionnaire = toQuestionnaireShape(responseMap);
    scoresByUser.set(
      member.user_id,
      computeMotivationScoreLocal(
        Number(questionnaire.confidence_score ?? "5"),
        questionnaire.blocker,
        questionnaire.competitive_style,
      ),
    );
  }

  const motivationValues = Array.from(scoresByUser.values());
  const averageScore =
    motivationValues.length > 0
      ? motivationValues.reduce((sum, value) => sum + value, 0) /
        motivationValues.length
      : 3;
  const dailyTaskCount = dailyTaskCountForTier(
    computeMotivationTierFromScore(averageScore),
  );

  const { error: clearErr } = await supabase
    .from("circle_member_category_selections")
    .delete()
    .eq("circle_id", circleId);

  if (clearErr) throw new Error(clearErr.message);

  const { error: saveErr } = await supabase
    .from("circle_member_category_selections")
    .insert(finalRows);

  if (saveErr) throw new Error(saveErr.message);

  const { error: circleErr } = await supabase
    .from("circles")
    .update({ daily_task_count: dailyTaskCount })
    .eq("id", circleId);

  if (circleErr) throw new Error(circleErr.message);

  return dailyTaskCount;
}

export function taskCountForAssignedCategory(
  dailyTaskCount: number,
  isCommon: boolean,
): number {
  if (dailyTaskCount <= 4) return isCommon ? 1 : 2;
  if (dailyTaskCount >= 9) return 3;
  return 2;
}
