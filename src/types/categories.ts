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
  completed_on: string;
  completed_day?: string;
}
