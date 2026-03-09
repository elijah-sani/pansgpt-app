export interface QuizHistoryItem {
  id: string;
  title: string;
  course_code: string;
  course_title: string;
  topic?: string;
  level: string;
  difficulty: string;
  num_questions: number;
  result: {
    id: string;
    percentage: number;
    score: number;
    max_score: number;
    time_taken?: number;
    created_at?: string;
    completed_at?: string;
  };
}

export interface QuizFilters {
  courseCode: string;
  level: string;
}
