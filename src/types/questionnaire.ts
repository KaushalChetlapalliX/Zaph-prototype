export interface QuestionnaireResponses {
  life_context?: string;
  primary_focus?: string;
  blocker?: string;
  last_week_wish?: string[];
  drill_down?: string;
  competitive_style?: string;
  confidence_score?: string;
  circle_intent?: string;
}

export interface CategoryScore {
  name: string;
  score: number;
}

export type MotivationTier = "low" | "medium" | "high";

export interface SuggestedCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  score: number;
  suggestedSubtasks: string[];
}
