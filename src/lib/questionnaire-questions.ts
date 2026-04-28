export type QuestionKind = "single" | "multi" | "slider";

export interface OptionDef {
  value: string;
  label: string;
}

export interface QuestionDef {
  key: string;
  kind: QuestionKind;
  prompt: string;
  subtitle?: string;
  options?: OptionDef[];
  maxPicks?: number;
  // For drill-down: only show if previous answer is in this set.
  showIfPrimaryFocus?: string[];
}

export const Q1: QuestionDef = {
  key: "life_context",
  kind: "single",
  prompt: "Where are you at right now?",
  subtitle: "One that fits today, not your whole life.",
  options: [
    { value: "grinding_unbalanced", label: "Grinding hard but losing balance" },
    { value: "getting_by", label: "Getting by, want to level up" },
    { value: "in_a_rut", label: "In a rut and need a real reset" },
    {
      value: "building_inconsistent",
      label: "Building something but lacking consistency",
    },
  ],
};

export const Q2: QuestionDef = {
  key: "primary_focus",
  kind: "single",
  prompt:
    "What's the one thing that, if you fixed it, would change everything?",
  options: [
    { value: "physical_health", label: "My physical health & energy" },
    { value: "focus_clarity", label: "My focus & mental clarity" },
    { value: "sleep_recovery", label: "My sleep & recovery" },
    { value: "money_habits", label: "My money habits" },
    { value: "relationships", label: "My relationships & social life" },
    { value: "daily_discipline", label: "My daily discipline" },
  ],
};

export const Q3: QuestionDef = {
  key: "blocker",
  kind: "single",
  prompt: "Be honest. What usually stops you?",
  options: [
    {
      value: "strong_start_fade",
      label: "I start strong but always lose momentum",
    },
    {
      value: "unpredictable_life",
      label: "Life gets unpredictable and I fall off",
    },
    { value: "distracted", label: "I get distracted way too easily" },
    {
      value: "no_accountability",
      label: "I have no one to keep me accountable",
    },
    {
      value: "dont_know_where_to_start",
      label: "I genuinely don't know where to begin",
    },
  ],
};

export const Q4: QuestionDef = {
  key: "last_week_wish",
  kind: "multi",
  maxPicks: 2,
  prompt: "Look back at last week. What do you wish you'd done more of?",
  subtitle: "Pick up to 2.",
  options: [
    { value: "physical", label: "Moved my body / worked out" },
    { value: "focus", label: "Focused deeply without distraction" },
    { value: "sleep", label: "Slept better / had more energy" },
    { value: "money", label: "Saved money or tracked spending" },
    { value: "connect", label: "Connected with people that matter" },
    { value: "space", label: "Took care of my space or environment" },
    { value: "meaningful", label: "Worked on something meaningful" },
  ],
};

const DRILL_PHYSICAL: QuestionDef = {
  key: "drill_down",
  kind: "single",
  prompt: "What describes your current fitness level?",
  showIfPrimaryFocus: ["physical_health"],
  options: [
    { value: "fitness_beginner", label: "Complete beginner" },
    { value: "fitness_inconsistent", label: "Tried but inconsistent" },
    { value: "fitness_sometimes", label: "Exercise sometimes" },
    { value: "fitness_active", label: "Already active, want more" },
  ],
};

const DRILL_SLEEP: QuestionDef = {
  key: "drill_down",
  kind: "single",
  prompt: "How would you describe your sleep right now?",
  showIfPrimaryFocus: ["sleep_recovery"],
  options: [
    { value: "sleep_good", label: "I sleep well and wake up refreshed" },
    { value: "sleep_okay", label: "It's okay but could be better" },
    { value: "sleep_struggle", label: "I struggle with sleep regularly" },
    { value: "sleep_chaotic", label: "My schedule is all over the place" },
  ],
};

const DRILL_FOCUS: QuestionDef = {
  key: "drill_down",
  kind: "single",
  prompt: "What's your biggest focus killer?",
  showIfPrimaryFocus: ["focus_clarity"],
  options: [
    { value: "focus_phone", label: "My phone" },
    { value: "focus_environment", label: "Noisy or chaotic environment" },
    { value: "focus_overwhelm", label: "Too many things to think about" },
    { value: "focus_energy", label: "Low energy, brain fog" },
  ],
};

export const Q6: QuestionDef = {
  key: "competitive_style",
  kind: "single",
  prompt: "When you're in a group challenge, you're the one who…",
  options: [
    { value: "goes_hardest", label: "Goes hardest and wants to win" },
    {
      value: "fired_up_by_others",
      label: "Gets fired up watching others do well",
    },
    { value: "quiet_competitor", label: "Quietly competes against yourself" },
    {
      value: "needs_group_energy",
      label: "Needs the group energy just to show up",
    },
  ],
};

export const Q7: QuestionDef = {
  key: "confidence_score",
  kind: "slider",
  prompt: "How confident are you that you'll show up every day this week?",
};

export const Q8: QuestionDef = {
  key: "circle_intent",
  kind: "single",
  prompt: "Are you joining with friends, or starting fresh?",
  options: [
    { value: "with_friends", label: "I have people ready to join" },
    { value: "going_solo", label: "I'm flying solo, open to a new circle" },
  ],
};

export function buildQuestionFlow(
  primaryFocus: string | undefined,
): QuestionDef[] {
  const drill =
    primaryFocus === "physical_health"
      ? DRILL_PHYSICAL
      : primaryFocus === "sleep_recovery"
        ? DRILL_SLEEP
        : primaryFocus === "focus_clarity"
          ? DRILL_FOCUS
          : null;

  return drill
    ? [Q1, Q2, Q3, Q4, drill, Q6, Q7, Q8]
    : [Q1, Q2, Q3, Q4, Q6, Q7, Q8];
}
