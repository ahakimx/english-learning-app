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
    | 'resume_session'
    | 'abandon_session'
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
    | 'writing_review'
    | 'no_active_session'
    | 'session_resumed'
    | 'session_abandoned';
  content: string;
  sessionData?: SessionData;
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

export interface SessionData {
  sessionId: string;
  jobPosition: string;
  seniorityLevel: SeniorityLevel;
  questionCategory: QuestionCategory;
  questions: SessionQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionQuestion {
  questionId: string;
  questionText: string;
  questionType?: QuestionType;
  transcription?: string;
  feedback?: FeedbackReport;
  answeredAt?: string;
}

// ============================================================
// Nova Sonic WebSocket Message Protocol Types (Frontend Mirror)
// ============================================================

// --- Session & Conversation Types ---

export interface SessionConfig {
  jobPosition: string;
  seniorityLevel: SeniorityLevel;
  questionCategory: QuestionCategory;
  resumeSessionId?: string; // untuk resume sesi
}

export interface TranscriptEvent {
  role: 'user' | 'ai';
  text: string;
  partial: boolean; // true = masih streaming, false = final
  timestamp: number;
}

export interface TurnEvent {
  currentSpeaker: 'ai' | 'user';
  interrupted: boolean;
}

export interface NovaSonicError {
  code: 'CONNECTION_FAILED' | 'AUTH_EXPIRED' | 'SESSION_TIMEOUT' | 'NOVA_SONIC_ERROR';
  message: string;
  retryable: boolean;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  questionId: string;
  feedback?: FeedbackReport;
}

// --- WebSocket Client → Server Messages ---

export type ClientMessage =
  | { type: 'start_session'; config: SessionConfig }
  | { type: 'audio_chunk'; data: string } // base64 encoded PCM audio
  | { type: 'end_session' }
  | { type: 'interrupt' }
  | { type: 'resume_session'; sessionId: string };

// --- WebSocket Server → Client Messages ---

export type ServerMessage =
  | { type: 'session_started'; sessionId: string }
  | { type: 'audio_chunk'; data: string } // base64 encoded audio from AI
  | { type: 'transcript_event'; event: TranscriptEvent }
  | { type: 'turn_event'; event: TurnEvent }
  | { type: 'feedback_event'; questionId: string; report: FeedbackReport }
  | { type: 'summary_event'; report: SummaryReport }
  | { type: 'session_ended'; sessionId: string }
  | { type: 'error'; error: NovaSonicError }
  | { type: 'reconnecting'; attempt: number; maxAttempts: number }
  | { type: 'auth_expired' };

// --- Frontend UI Component Props ---

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'ai';
  text: string;
  partial: boolean;
  timestamp: number;
  questionId?: string; // untuk mapping feedback
}

export interface LiveTranscriptPanelProps {
  transcripts: TranscriptEntry[];
  currentTurn: 'ai' | 'user' | 'idle';
  feedbackCards: Map<string, FeedbackReport>; // questionId → feedback
}

export interface InlineFeedbackCardProps {
  feedbackReport: FeedbackReport;
  expanded: boolean;
  onToggleExpand: () => void;
}

export interface SessionInfoPanelProps {
  jobPosition: string;
  seniorityLevel: SeniorityLevel;
  questionCategory: QuestionCategory;
  sessionDuration: number; // seconds
  questionCount: number;
  currentQuestionNumber: number;
  fillerWordCount: number;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
}

// --- useNovaSonic Hook Types ---

export interface UseNovaSonicOptions {
  onTranscript: (event: TranscriptEvent) => void;
  onAudio: (audioData: string) => void;
  onTurnChange: (event: TurnEvent) => void;
  onFeedback: (report: FeedbackReport) => void;
  onError: (error: NovaSonicError) => void;
  onSessionEnd: (summary: SummaryReport) => void;
}

export interface UseNovaSonicReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  startSession: (config: SessionConfig) => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  endSession: () => void;
  interrupt: () => void;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  currentTurn: 'ai' | 'user' | 'idle';
  sessionActive: boolean;
}
