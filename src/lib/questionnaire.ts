import type { MotivationTier } from "../types/questionnaire";

export const CATEGORY_NAMES = {
  PHYSICAL: "Physical Activity",
  FOCUS: "Deep Focus",
  ACADEMIC: "Academic Mastery",
  SLEEP: "Sleep Hygiene",
  NUTRITION: "Hydration & Nutrition",
  FINANCIAL: "Financial Discipline",
  MENTAL: "Mental Well-being",
  SOCIAL: "Social Quality",
  ENVIRONMENT: "Environment",
  CONSISTENCY: "Consistency",
} as const;

type CategoryScoreMap = Partial<Record<string, number>>;

const Q1_SCORES: Record<string, CategoryScoreMap> = {
  grinding_unbalanced: { "Mental Well-being": 1, "Social Quality": 1 },
  getting_by: { Consistency: 1 },
  in_a_rut: { Consistency: 1, "Mental Well-being": 1 },
  building_inconsistent: { "Deep Focus": 1, Consistency: 1 },
};

const Q2_SCORES: Record<string, CategoryScoreMap> = {
  physical_health: { "Physical Activity": 3, "Sleep Hygiene": 1 },
  focus_clarity: { "Deep Focus": 3, "Mental Well-being": 1 },
  sleep_recovery: { "Sleep Hygiene": 3, "Physical Activity": 1 },
  money_habits: { "Financial Discipline": 3 },
  relationships: { "Social Quality": 3 },
  daily_discipline: { Consistency: 3 },
};

const Q3_SCORES: Record<string, CategoryScoreMap> = {
  strong_start_fade: { Consistency: 2 },
  unpredictable_life: { Consistency: 1 },
  distracted: { "Deep Focus": 2 },
  no_accountability: {},
  dont_know_where_to_start: {},
};

const Q4_SCORES: Record<string, CategoryScoreMap> = {
  physical: { "Physical Activity": 2 },
  focus: { "Deep Focus": 2 },
  sleep: { "Sleep Hygiene": 2 },
  money: { "Financial Discipline": 2 },
  connect: { "Social Quality": 2 },
  space: { Environment: 2 },
  meaningful: { "Deep Focus": 1, Consistency: 1 },
};

export function computeCategoryScores(
  responses: Record<string, string[]>,
): Record<string, number> {
  const scores: Record<string, number> = {};

  const addScores = (map: CategoryScoreMap) => {
    for (const [cat, pts] of Object.entries(map)) {
      scores[cat] = (scores[cat] ?? 0) + (pts ?? 0);
    }
  };

  const q1 = responses["life_context"]?.[0];
  if (q1 && Q1_SCORES[q1]) addScores(Q1_SCORES[q1]);

  const q2 = responses["primary_focus"]?.[0];
  if (q2 && Q2_SCORES[q2]) addScores(Q2_SCORES[q2]);

  const q3 = responses["blocker"]?.[0];
  if (q3 && Q3_SCORES[q3]) addScores(Q3_SCORES[q3]);

  const q4answers = responses["last_week_wish"] ?? [];
  for (const ans of q4answers) {
    if (Q4_SCORES[ans]) addScores(Q4_SCORES[ans]);
  }

  return scores;
}

export function getTopCategories(
  scores: Record<string, number>,
  count = 3,
): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([name]) => name);
}

const SUBTASK_PREFERENCES: Record<string, Record<string, string[]>> = {
  "Physical Activity": {
    fitness_beginner: ["Morning stretch / yoga", "30 min workout"],
    fitness_inconsistent: ["30 min workout", "Hit 10,000 steps"],
    fitness_sometimes: ["30 min workout", "Run 3km"],
    fitness_active: ["Run 3km", "Hit 10,000 steps"],
    low: ["Morning stretch / yoga", "30 min workout"],
    medium: ["30 min workout", "Hit 10,000 steps"],
    high: ["Run 3km", "Hit 10,000 steps"],
  },
  "Sleep Hygiene": {
    sleep_good: ["Consistent wake-up time", "No screens 30min before bed"],
    sleep_okay: ["In bed by 11pm", "Get 7+ hours of sleep"],
    sleep_struggle: ["In bed by 11pm", "Wake up before 8am"],
    sleep_chaotic: ["Consistent wake-up time", "In bed by 11pm"],
    low: ["In bed by 11pm", "Get 7+ hours of sleep"],
    medium: ["In bed by 11pm", "Wake up before 8am"],
    high: ["Consistent wake-up time", "No screens 30min before bed"],
  },
  "Deep Focus": {
    focus_phone: ["Phone-free morning", "2hr deep work block"],
    focus_environment: ["2hr deep work block", "Complete one key task"],
    focus_overwhelm: ["Complete one key task", "1hr reading"],
    focus_energy: ["1hr reading", "Complete one key task"],
    low: ["Complete one key task", "1hr reading"],
    medium: ["2hr deep work block", "Complete one key task"],
    high: ["2hr deep work block", "No social media before noon"],
  },
};

export function getSuggestedSubtasks(
  categoryName: string,
  drillDownAnswer: string | null,
  motivationTier: MotivationTier,
): string[] {
  const prefs = SUBTASK_PREFERENCES[categoryName];
  if (!prefs) return [];
  const key =
    drillDownAnswer && prefs[drillDownAnswer]
      ? drillDownAnswer
      : motivationTier;
  return prefs[key] ?? prefs[motivationTier] ?? [];
}

export function computeMotivationScoreLocal(
  confidence: number,
  blocker: string | undefined,
  competitive: string | undefined,
): number {
  const conf = Math.max(1, Math.min(10, confidence));
  const base = conf / 2;

  const blockerWeight: Record<string, number> = {
    strong_start_fade: -1,
    unpredictable_life: -0.5,
    distracted: 0,
    no_accountability: 0,
    dont_know_where_to_start: -1.5,
  };
  const competitiveWeight: Record<string, number> = {
    goes_hardest: 1,
    fired_up_by_others: 0.5,
    quiet_competitor: 0,
    needs_group_energy: -0.5,
  };

  let score = base;
  if (blocker && blockerWeight[blocker] != null)
    score += blockerWeight[blocker];
  if (competitive && competitiveWeight[competitive] != null)
    score += competitiveWeight[competitive];

  return Math.max(1, Math.min(5, Number(score.toFixed(2))));
}

export function computeMotivationTierFromScore(
  motivationScore: number,
): MotivationTier {
  if (motivationScore <= 2.4) return "low";
  if (motivationScore <= 3.4) return "medium";
  return "high";
}

export function computeMotivationTierLocal(
  confidence: number,
  blocker: string | undefined,
  competitive: string | undefined,
): MotivationTier {
  return computeMotivationTierFromScore(
    computeMotivationScoreLocal(confidence, blocker, competitive),
  );
}

export function tierLabel(tier: MotivationTier): string {
  if (tier === "high") return "High Energy";
  if (tier === "medium") return "Steady";
  return "Easy Start";
}

export function dailyTaskCountForTier(tier: MotivationTier): number {
  if (tier === "high") return 9;
  if (tier === "medium") return 6;
  return 4;
}
