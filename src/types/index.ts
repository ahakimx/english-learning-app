// Frontend shared TypeScript type definitions

export type SeniorityLevel = 'junior' | 'mid' | 'senior' | 'lead';

export type QuestionCategory = 'general' | 'technical';

export type QuestionType = 'introduction' | 'contextual';

export interface ChatRequest {
  sessionId?: string;
  action:
    | 'start_session'
    | 'analyze_answer'
    | 'next_question'
    | 'end_session'
    | 'grammar_quiz'
    | 'grammar_explain'
    | 'writing_prompt'
    | 'writing_review';
  jobPosition?: string;
  transcription?: string;
  grammarTopic?: string;
  selectedAnswer?: string;
  writingType?: 'essay' | 'email';
  writingContent?: string;
  seniorityLevel?: SeniorityLevel;
  questionCategory?: QuestionCategory;
}

export interface ChatResponse {
  sessionId: string;
  type:
    | 'question'
    | 'feedback'
    | 'summary'
    | 'quiz'
    | 'explanation'
    | 'writing_prompt'
    | 'writing_review';
  content: string;
  feedbackReport?: FeedbackReport;
  summaryReport?: SummaryReport;
  quizData?: QuizData;
  writingReview?: WritingReviewData;
  questionType?: QuestionType;
}

export interface FeedbackReport {
  scores: {
    grammar: number; // 0-100
    vocabulary: number; // 0-100
    relevance: number; // 0-100
    fillerWords: number; // 0-100
    coherence: number; // 0-100
    overall: number; // 0-100
  };
  grammarErrors: Array<{
    original: string;
    correction: string;
    rule: string;
  }>;
  fillerWordsDetected: Array<{
    word: string;
    count: number;
  }>;
  suggestions: string[];
  improvedAnswer: string;
}

export interface SummaryReport {
  overallScore: number;
  criteriaScores: {
    grammar: number;
    vocabulary: number;
    relevance: number;
    fillerWords: number;
    coherence: number;
  };
  performanceTrend: Array<{
    questionNumber: number;
    score: number;
  }>;
  topImprovementAreas: string[];
  recommendations: string[];
}

export interface QuizData {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface WritingReviewData {
  overallScore: number;
  aspects: {
    grammarCorrectness: {
      score: number;
      errors: Array<{
        text: string;
        correction: string;
        explanation: string;
      }>;
    };
    structure: {
      score: number;
      feedback: string;
    };
    vocabulary: {
      score: number;
      suggestions: string[];
    };
  };
}

export interface ProgressData {
  speaking: {
    totalSessions: number;
    averageScore: number;
    scoreHistory: Array<{ date: string; score: number }>;
  };
  grammar: {
    totalQuizzes: number;
    topicScores: Record<string, { accuracy: number }>;
  };
  writing: {
    totalReviews: number;
    averageScore: number;
    scoreHistory: Array<{ date: string; score: number }>;
  };
}
