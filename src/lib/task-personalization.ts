import { supabase } from "./supabase";
import {
  computeMotivationScoreLocal,
  computeMotivationTierFromScore,
  getSuggestedSubtasks,
} from "./questionnaire";

type QuestionnaireResponseRow = {
  answer_value: string;
  question_key: string;
};

type CategoryName = {
  id: string;
  name: string;
};

type ProfileScoreRow = {
  motivation_score?: number | null;
};

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

export async function loadPreferredSubtaskTitlesByCategoryId(
  userId: string,
  categories: CategoryName[],
): Promise<Record<string, Set<string>>> {
  const preferredTitlesByCategoryId: Record<string, Set<string>> = {};
  if (!userId || categories.length === 0) return preferredTitlesByCategoryId;

  const { data: responseRows, error: responseErr } = await supabase
    .from("user_questionnaire_responses")
    .select("question_key, answer_value")
    .eq("user_id", userId);

  if (responseErr || !responseRows || responseRows.length === 0) {
    return preferredTitlesByCategoryId;
  }

  const responses = rowsToResponses(responseRows as QuestionnaireResponseRow[]);
  const confidence = Number(responses["confidence_score"]?.[0] ?? "5");
  const blocker = responses["blocker"]?.[0];
  const competitiveStyle = responses["competitive_style"]?.[0];
  const drillDownAnswer = responses["drill_down"]?.[0] ?? null;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("motivation_score")
    .eq("id", userId)
    .maybeSingle();

  const profile = (profileRow ?? null) as ProfileScoreRow | null;
  const motivationScore =
    typeof profile?.motivation_score === "number"
      ? profile.motivation_score
      : computeMotivationScoreLocal(confidence, blocker, competitiveStyle);
  const motivationTier = computeMotivationTierFromScore(motivationScore);

  for (const category of categories) {
    const titles = getSuggestedSubtasks(
      category.name,
      drillDownAnswer,
      motivationTier,
    )
      .map((title) => title.trim().toLowerCase())
      .filter((title) => title.length > 0);

    if (titles.length > 0) {
      preferredTitlesByCategoryId[category.id] = new Set(titles);
    }
  }

  return preferredTitlesByCategoryId;
}
