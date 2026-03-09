import { APIGatewayProxyEvent } from 'aws-lambda';
import fc from 'fast-check';

// Mock AWS SDK clients before importing handler
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend })),
  },
  PutCommand: jest.fn((params: unknown) => ({ _type: 'PutCommand', params })),
  GetCommand: jest.fn((params: unknown) => ({ _type: 'GetCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({ _type: 'UpdateCommand', params })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { handler } from '../lambda/chat/index';

// --- Helpers ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function createEvent(body: Record<string, unknown>, userId = 'test-user-id-123'): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/chat',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/chat',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: { claims: { sub: userId } },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/chat',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/chat',
    },
  };
}

/** Arbitrary for valid job position strings (non-empty, printable ASCII) */
const jobPositionArb = fc.stringOf(
  fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
  { minLength: 1, maxLength: 50 }
);

/** Arbitrary for non-empty transcription strings (printable ASCII) */
const transcriptionArb = fc.stringOf(
  fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
  { minLength: 1, maxLength: 200 }
);

/** Arbitrary for a score value 0-100 */
const scoreArb = fc.integer({ min: 0, max: 100 });

/** Generate a valid FeedbackReport with arbitrary scores */
const feedbackReportArb = fc.record({
  grammar: scoreArb,
  vocabulary: scoreArb,
  relevance: scoreArb,
  fillerWords: scoreArb,
  coherence: scoreArb,
  overall: scoreArb,
}).map(scores => ({
  scores,
  grammarErrors: [] as Array<{ original: string; correction: string; rule: string }>,
  fillerWordsDetected: [] as Array<{ word: string; count: number }>,
  suggestions: ['Practice more'],
  improvedAnswer: 'An improved answer.',
}));

/** Generate a valid SummaryReport with arbitrary scores */
const summaryReportArb = fc.record({
  overallScore: scoreArb,
  grammar: scoreArb,
  vocabulary: scoreArb,
  relevance: scoreArb,
  fillerWords: scoreArb,
  coherence: scoreArb,
}).map(({ overallScore, grammar, vocabulary, relevance, fillerWords, coherence }) => ({
  overallScore,
  criteriaScores: { grammar, vocabulary, relevance, fillerWords, coherence },
  performanceTrend: [{ questionNumber: 1, score: overallScore }],
  topImprovementAreas: ['Grammar', 'Vocabulary', 'Filler words'],
  recommendations: ['Keep practicing'],
}));

/** Arbitrary for generating N previous question texts (N >= 1) */
const previousQuestionsArb = fc.array(
  fc.stringOf(fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127), { minLength: 5, maxLength: 80 }),
  { minLength: 1, maxLength: 5 }
);


describe('Chat Lambda - Property-Based Tests (Speaking Module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  // Feature: english-learning-app, Property 4: Pembuatan sesi interview menyimpan metadata dengan benar
  // **Validates: Requirements 3.2**
  describe('Property 4: Session creation saves metadata correctly', () => {
    test('For any valid job position, start_session saves correct metadata to DynamoDB', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(jobPositionArb, async (jobPosition) => {
          jest.clearAllMocks();

          // Mock Bedrock to return a question
          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'What is your experience?' }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const event = createEvent({ action: 'start_session', jobPosition });
          const result = await handler(event);
          const body = JSON.parse(result.body);

          // Response has a valid UUID sessionId
          expect(body.sessionId).toMatch(UUID_REGEX);

          // DynamoDB PutCommand was called with correct metadata
          expect(PutCommand).toHaveBeenCalledTimes(1);
          const putCall = PutCommand.mock.calls[0][0];
          const item = putCall.Item;

          expect(item.userId).toBe('test-user-id-123');
          expect(item.sessionId).toMatch(UUID_REGEX);
          expect(item.jobPosition).toBe(jobPosition);
          expect(item.status).toBe('active');
          expect(item.type).toBe('speaking');
          expect(item.createdAt).toMatch(ISO_8601_REGEX);
          expect(item.updatedAt).toMatch(ISO_8601_REGEX);
          expect(Array.isArray(item.questions)).toBe(true);
          expect(item.questions.length).toBeGreaterThanOrEqual(1);
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 8: FeedbackReport memiliki struktur lengkap dengan skor valid
  // **Validates: Requirements 5.1, 5.2**
  describe('Property 8: FeedbackReport has complete structure with valid scores', () => {
    test('For any non-empty transcription, analyze_answer returns a FeedbackReport with all required fields and scores 0-100', async () => {
      await fc.assert(
        fc.asyncProperty(transcriptionArb, feedbackReportArb, async (transcription, mockFeedback) => {
          jest.clearAllMocks();

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user-id-123',
                  sessionId: 'session-1',
                  questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
                },
              });
            }
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: JSON.stringify(mockFeedback) }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const event = createEvent({
            action: 'analyze_answer',
            sessionId: 'session-1',
            transcription,
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          const report = body.feedbackReport;

          // All 6 score fields are numbers between 0-100
          for (const key of ['grammar', 'vocabulary', 'relevance', 'fillerWords', 'coherence', 'overall']) {
            expect(typeof report.scores[key]).toBe('number');
            expect(report.scores[key]).toBeGreaterThanOrEqual(0);
            expect(report.scores[key]).toBeLessThanOrEqual(100);
          }

          // grammarErrors is an array
          expect(Array.isArray(report.grammarErrors)).toBe(true);

          // fillerWordsDetected is an array
          expect(Array.isArray(report.fillerWordsDetected)).toBe(true);

          // suggestions is a non-empty array
          expect(Array.isArray(report.suggestions)).toBe(true);
          expect(report.suggestions.length).toBeGreaterThan(0);

          // improvedAnswer is a non-empty string
          expect(typeof report.improvedAnswer).toBe('string');
          expect(report.improvedAnswer.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 9: FeedbackReport tersimpan dan terkait dengan sesi yang benar
  // **Validates: Requirements 5.4**
  describe('Property 9: FeedbackReport is saved and linked to correct session', () => {
    test('For any FeedbackReport, analyze_answer UpdateCommand targets the correct table, userId, sessionId and includes feedback and transcription', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(
          transcriptionArb,
          feedbackReportArb,
          fc.stringOf(fc.char().filter(c => c.charCodeAt(0) >= 97 && c.charCodeAt(0) <= 122), { minLength: 5, maxLength: 20 }),
          async (transcription, mockFeedback, sessionId) => {
            jest.clearAllMocks();

            mockSend.mockImplementation((command: { _type?: string }) => {
              if (command._type === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    userId: 'test-user-id-123',
                    sessionId,
                    questions: [{ questionId: 'q1', questionText: 'Describe your skills' }],
                  },
                });
              }
              if (command._type === 'InvokeModelCommand') {
                return Promise.resolve({
                  body: new TextEncoder().encode(
                    JSON.stringify({ content: [{ text: JSON.stringify(mockFeedback) }] })
                  ),
                });
              }
              return Promise.resolve({});
            });

            const event = createEvent({
              action: 'analyze_answer',
              sessionId,
              transcription,
            });
            await handler(event);

            expect(UpdateCommand).toHaveBeenCalledTimes(1);
            const updateCall = UpdateCommand.mock.calls[0][0];

            // Targets the correct table
            expect(updateCall.TableName).toBe('test-sessions-table');

            // Targets the correct userId and sessionId
            expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId });

            // Includes the feedback in the update
            expect(updateCall.ExpressionAttributeValues[':feedback']).toEqual(mockFeedback);

            // Includes the transcription text
            expect(updateCall.ExpressionAttributeValues[':transcription']).toBe(transcription);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // Feature: english-learning-app, Property 10: Pertanyaan interview dalam satu sesi tidak berulang
  // **Validates: Requirements 6.2**
  describe('Property 10: Interview questions in one session do not repeat', () => {
    test('For any session with N previous questions, next_question sends all previous question texts to Bedrock and includes the job position', async () => {
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

      await fc.assert(
        fc.asyncProperty(previousQuestionsArb, jobPositionArb, async (prevQuestions, jobPosition) => {
          jest.clearAllMocks();

          const questions = prevQuestions.map((text, i) => ({
            questionId: `q${i + 1}`,
            questionText: text,
            feedback: { scores: { overall: 80 } },
          }));

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user-id-123',
                  sessionId: 'session-1',
                  jobPosition,
                  questions,
                },
              });
            }
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'A brand new question?' }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const event = createEvent({ action: 'next_question', sessionId: 'session-1' });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          // Bedrock was called
          expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
          const bedrockCall = InvokeModelCommand.mock.calls[0][0];
          const body = JSON.parse(bedrockCall.body);
          const prompt = body.messages[0].content;

          // All previous question texts are sent to Bedrock
          for (const q of prevQuestions) {
            expect(prompt).toContain(q);
          }

          // The job position is included in the prompt
          expect(prompt).toContain(jobPosition);
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 11: SummaryReport memiliki struktur lengkap
  // **Validates: Requirements 7.1**
  describe('Property 11: SummaryReport has complete structure', () => {
    test('For any completed session with feedback, end_session returns a SummaryReport with valid structure', async () => {
      await fc.assert(
        fc.asyncProperty(summaryReportArb, async (mockSummary) => {
          jest.clearAllMocks();

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user-id-123',
                  sessionId: 'session-1',
                  jobPosition: 'Software Engineer',
                  questions: [{
                    questionId: 'q1',
                    questionText: 'Tell me about yourself',
                    feedback: {
                      scores: { grammar: 80, vocabulary: 75, relevance: 85, fillerWords: 70, coherence: 80, overall: 78 },
                      grammarErrors: [],
                      fillerWordsDetected: [],
                      suggestions: ['Be specific'],
                      improvedAnswer: 'Better answer',
                    },
                  }],
                },
              });
            }
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: JSON.stringify(mockSummary) }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const event = createEvent({ action: 'end_session', sessionId: 'session-1' });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          const report = body.summaryReport;

          // overallScore is a number between 0-100
          expect(typeof report.overallScore).toBe('number');
          expect(report.overallScore).toBeGreaterThanOrEqual(0);
          expect(report.overallScore).toBeLessThanOrEqual(100);

          // All 5 criteriaScores are numbers between 0-100
          for (const key of ['grammar', 'vocabulary', 'relevance', 'fillerWords', 'coherence']) {
            expect(typeof report.criteriaScores[key]).toBe('number');
            expect(report.criteriaScores[key]).toBeGreaterThanOrEqual(0);
            expect(report.criteriaScores[key]).toBeLessThanOrEqual(100);
          }

          // performanceTrend is a non-empty array
          expect(Array.isArray(report.performanceTrend)).toBe(true);
          expect(report.performanceTrend.length).toBeGreaterThan(0);

          // Exactly 3 topImprovementAreas
          expect(Array.isArray(report.topImprovementAreas)).toBe(true);
          expect(report.topImprovementAreas).toHaveLength(3);

          // recommendations is a non-empty array
          expect(Array.isArray(report.recommendations)).toBe(true);
          expect(report.recommendations.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 12: SummaryReport tersimpan dan terkait dengan user
  // **Validates: Requirements 7.3**
  describe('Property 12: SummaryReport is saved and linked to user', () => {
    test('For any SummaryReport, end_session UpdateCommand sets status to completed, includes summaryReport, and targets correct table/userId/sessionId', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(
          summaryReportArb,
          fc.stringOf(fc.char().filter(c => c.charCodeAt(0) >= 97 && c.charCodeAt(0) <= 122), { minLength: 5, maxLength: 20 }),
          async (mockSummary, sessionId) => {
            jest.clearAllMocks();

            mockSend.mockImplementation((command: { _type?: string }) => {
              if (command._type === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    userId: 'test-user-id-123',
                    sessionId,
                    jobPosition: 'Data Analyst',
                    questions: [{
                      questionId: 'q1',
                      questionText: 'Why this role?',
                      feedback: {
                        scores: { grammar: 70, vocabulary: 65, relevance: 80, fillerWords: 60, coherence: 75, overall: 70 },
                        grammarErrors: [],
                        fillerWordsDetected: [],
                        suggestions: ['Improve'],
                        improvedAnswer: 'Better',
                      },
                    }],
                  },
                });
              }
              if (command._type === 'InvokeModelCommand') {
                return Promise.resolve({
                  body: new TextEncoder().encode(
                    JSON.stringify({ content: [{ text: JSON.stringify(mockSummary) }] })
                  ),
                });
              }
              return Promise.resolve({});
            });

            const event = createEvent({ action: 'end_session', sessionId });
            await handler(event);

            expect(UpdateCommand).toHaveBeenCalledTimes(1);
            const updateCall = UpdateCommand.mock.calls[0][0];

            // Targets the correct table
            expect(updateCall.TableName).toBe('test-sessions-table');

            // Targets the correct userId and sessionId
            expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId });

            // Sets status to 'completed'
            expect(updateCall.ExpressionAttributeValues[':status']).toBe('completed');

            // Includes the summaryReport
            expect(updateCall.ExpressionAttributeValues[':summaryReport']).toEqual(mockSummary);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Chat Lambda - Property-Based Tests (Grammar Module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  // Feature: english-learning-app, Property 13: Quiz grammar menghasilkan soal dengan 4 pilihan dan 1 jawaban benar
  // **Validates: Requirements 8.2**
  describe('Property 13: Grammar quiz generates questions with 4 options and 1 correct answer', () => {
    /** Arbitrary for grammar topic strings (non-empty) */
    const grammarTopicArb = fc.stringOf(
      fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
      { minLength: 1, maxLength: 50 }
    );

    test('For any valid grammar topic, grammar_quiz returns quizData with exactly 4 options and correctAnswer is one of them', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(grammarTopicArb, async (grammarTopic) => {
          jest.clearAllMocks();

          // Generate 4 distinct options and pick one as correct
          const mockOptions = ['Option A', 'Option B', 'Option C', 'Option D'];
          const mockCorrectAnswer = 'Option B';
          const mockQuiz = {
            question: `What is the correct usage of ${grammarTopic}?`,
            options: mockOptions,
            correctAnswer: mockCorrectAnswer,
          };

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: JSON.stringify(mockQuiz) }] })
                ),
              });
            }
            // DynamoDB PutCommand
            return Promise.resolve({});
          });

          const event = createEvent({ action: 'grammar_quiz', grammarTopic });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          const quizData = body.quizData;

          // quizData must exist
          expect(quizData).toBeDefined();

          // question must be a non-empty string
          expect(typeof quizData.question).toBe('string');
          expect(quizData.question.length).toBeGreaterThan(0);

          // options must be an array of exactly 4 items
          expect(Array.isArray(quizData.options)).toBe(true);
          expect(quizData.options).toHaveLength(4);

          // correctAnswer must be a non-empty string
          expect(typeof quizData.correctAnswer).toBe('string');
          expect(quizData.correctAnswer.length).toBeGreaterThan(0);

          // correctAnswer must be one of the 4 options
          expect(quizData.options).toContain(quizData.correctAnswer);

          // DynamoDB PutCommand was called to save the session
          expect(PutCommand).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 14: Validasi jawaban quiz mengembalikan hasil yang benar
  // **Validates: Requirements 8.3**
  describe('Property 14: Quiz answer validation returns correct result', () => {
    /** Arbitrary for 4 distinct non-empty option strings */
    const distinctOptionsArb = fc.uniqueArray(
      fc.stringOf(
        fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
        { minLength: 1, maxLength: 40 }
      ),
      { minLength: 4, maxLength: 4, comparator: (a, b) => a === b }
    );

    /** Arbitrary for an index 0-3 */
    const optionIndexArb = fc.integer({ min: 0, max: 3 });

    test('For any quiz with 4 options, isCorrect is true iff selectedAnswer === correctAnswer', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(
          distinctOptionsArb,
          optionIndexArb,
          optionIndexArb,
          async (options, correctIdx, selectedIdx) => {
            jest.clearAllMocks();

            const correctAnswer = options[correctIdx];
            const selectedAnswer = options[selectedIdx];
            const expectedIsCorrect = selectedAnswer === correctAnswer;

            const mockQuiz = {
              questionId: 'quiz-q1',
              question: 'Choose the correct grammar form.',
              options,
              correctAnswer,
            };

            mockSend.mockImplementation((command: { _type?: string }) => {
              if (command._type === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    userId: 'test-user-id-123',
                    sessionId: 'grammar-session-1',
                    type: 'grammar',
                    currentQuiz: mockQuiz,
                    quizResults: [],
                  },
                });
              }
              if (command._type === 'InvokeModelCommand') {
                return Promise.resolve({
                  body: new TextEncoder().encode(
                    JSON.stringify({ content: [{ text: 'This is the grammar explanation.' }] })
                  ),
                });
              }
              // UpdateCommand
              return Promise.resolve({});
            });

            const event = createEvent({
              action: 'grammar_explain',
              sessionId: 'grammar-session-1',
              selectedAnswer,
            });
            const result = await handler(event);
            expect(result.statusCode).toBe(200);

            // Verify the UpdateCommand was called with the correct isCorrect value
            expect(UpdateCommand).toHaveBeenCalledTimes(1);
            const updateCall = UpdateCommand.mock.calls[0][0];

            // The quiz result saved to DynamoDB should have the correct isCorrect value
            const savedResults = updateCall.ExpressionAttributeValues[':newResult'];
            expect(Array.isArray(savedResults)).toBe(true);
            expect(savedResults).toHaveLength(1);

            const savedQuizResult = savedResults[0];
            expect(savedQuizResult.isCorrect).toBe(expectedIsCorrect);
            expect(savedQuizResult.userAnswer).toBe(selectedAnswer);
            expect(savedQuizResult.correctAnswer).toBe(correctAnswer);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 15: Penjelasan jawaban quiz selalu tersedia
  // **Validates: Requirements 8.4**
  describe('Property 15: Quiz answer explanation is always available', () => {
    /** Arbitrary for a non-empty question text */
    const questionTextArb = fc.stringOf(
      fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
      { minLength: 1, maxLength: 80 }
    );

    /** Arbitrary for 4 distinct non-empty option strings */
    const fourOptionsArb = fc.uniqueArray(
      fc.stringOf(
        fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
        { minLength: 1, maxLength: 40 }
      ),
      { minLength: 4, maxLength: 4, comparator: (a, b) => a === b }
    );

    /** Arbitrary for an index 0-3 to pick selectedAnswer from options */
    const selectedIndexArb = fc.integer({ min: 0, max: 3 });

    test('For any quiz question and any selected answer, the response content (explanation) is a non-empty string and is saved in the quiz result', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(
          questionTextArb,
          fourOptionsArb,
          selectedIndexArb,
          selectedIndexArb,
          async (questionText, options, correctIdx, selectedIdx) => {
            jest.clearAllMocks();

            const correctAnswer = options[correctIdx];
            const selectedAnswer = options[selectedIdx];

            const mockQuiz = {
              questionId: 'quiz-prop15',
              question: questionText,
              options,
              correctAnswer,
            };

            // Mock explanation from Bedrock — a non-empty string mentioning a grammar rule
            const mockExplanation = 'The correct answer uses the present perfect tense because the action started in the past and continues to the present.';

            mockSend.mockImplementation((command: { _type?: string }) => {
              if (command._type === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    userId: 'test-user-id-123',
                    sessionId: 'grammar-session-prop15',
                    type: 'grammar',
                    currentQuiz: mockQuiz,
                    quizResults: [],
                  },
                });
              }
              if (command._type === 'InvokeModelCommand') {
                return Promise.resolve({
                  body: new TextEncoder().encode(
                    JSON.stringify({ content: [{ text: mockExplanation }] })
                  ),
                });
              }
              // UpdateCommand
              return Promise.resolve({});
            });

            const event = createEvent({
              action: 'grammar_explain',
              sessionId: 'grammar-session-prop15',
              selectedAnswer,
            });
            const result = await handler(event);
            expect(result.statusCode).toBe(200);

            const body = JSON.parse(result.body);

            // Response type must be 'explanation'
            expect(body.type).toBe('explanation');

            // Response content (explanation) must be a non-empty string
            expect(typeof body.content).toBe('string');
            expect(body.content.length).toBeGreaterThan(0);

            // Verify the explanation is saved in the quiz result in DynamoDB
            expect(UpdateCommand).toHaveBeenCalledTimes(1);
            const updateCall = UpdateCommand.mock.calls[0][0];
            const savedResults = updateCall.ExpressionAttributeValues[':newResult'];
            expect(Array.isArray(savedResults)).toBe(true);
            expect(savedResults).toHaveLength(1);

            const savedQuizResult = savedResults[0];
            // The explanation field in the saved quiz result must be a non-empty string
            expect(typeof savedQuizResult.explanation).toBe('string');
            expect(savedQuizResult.explanation.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 16: Progress grammar tersimpan per topik
  // **Validates: Requirements 8.5**
  describe('Property 16: Grammar progress is saved per topic', () => {
    /** Arbitrary for grammar topic strings (non-empty, printable ASCII) */
    const grammarTopicArb = fc.stringOf(
      fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
      { minLength: 1, maxLength: 50 }
    );

    /** Arbitrary for a non-empty question text */
    const questionTextArb = fc.stringOf(
      fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
      { minLength: 1, maxLength: 80 }
    );

    /** Arbitrary for 4 distinct non-empty option strings */
    const fourOptionsArb = fc.uniqueArray(
      fc.stringOf(
        fc.char().filter(c => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
        { minLength: 1, maxLength: 40 }
      ),
      { minLength: 4, maxLength: 4, comparator: (a, b) => a === b }
    );

    /** Arbitrary for an index 0-3 */
    const optionIndexArb = fc.integer({ min: 0, max: 3 });

    test('For any grammar topic and quiz, grammar_explain saves quiz result with correct grammarTopic, all required fields, and uses list_append on quizResults', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(
          grammarTopicArb,
          questionTextArb,
          fourOptionsArb,
          optionIndexArb,
          optionIndexArb,
          async (grammarTopic, questionText, options, correctIdx, selectedIdx) => {
            jest.clearAllMocks();

            const correctAnswer = options[correctIdx];
            const selectedAnswer = options[selectedIdx];

            const mockQuiz = {
              questionId: 'quiz-prop16',
              question: questionText,
              options,
              correctAnswer,
            };

            const mockExplanation = 'This rule applies because of subject-verb agreement in English grammar.';

            mockSend.mockImplementation((command: { _type?: string }) => {
              if (command._type === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    userId: 'test-user-id-123',
                    sessionId: 'grammar-session-prop16',
                    type: 'grammar',
                    grammarTopic,
                    currentQuiz: mockQuiz,
                    quizResults: [],
                  },
                });
              }
              if (command._type === 'InvokeModelCommand') {
                return Promise.resolve({
                  body: new TextEncoder().encode(
                    JSON.stringify({ content: [{ text: mockExplanation }] })
                  ),
                });
              }
              // UpdateCommand
              return Promise.resolve({});
            });

            const event = createEvent({
              action: 'grammar_explain',
              sessionId: 'grammar-session-prop16',
              selectedAnswer,
            });
            const result = await handler(event);
            expect(result.statusCode).toBe(200);

            // Verify UpdateCommand was called
            expect(UpdateCommand).toHaveBeenCalledTimes(1);
            const updateCall = UpdateCommand.mock.calls[0][0];

            // 1. The session containing the quiz result is associated with the correct grammarTopic
            // The GetCommand returned a session with grammarTopic, and the UpdateCommand targets the same session
            expect(updateCall.TableName).toBe('test-sessions-table');
            expect(updateCall.Key).toEqual({
              userId: 'test-user-id-123',
              sessionId: 'grammar-session-prop16',
            });

            // 2. The UpdateExpression uses list_append to add to quizResults
            expect(updateCall.UpdateExpression).toContain('list_append');
            expect(updateCall.UpdateExpression).toContain('quizResults');

            // 3. The quiz result contains all required fields
            const savedResults = updateCall.ExpressionAttributeValues[':newResult'];
            expect(Array.isArray(savedResults)).toBe(true);
            expect(savedResults).toHaveLength(1);

            const savedQuizResult = savedResults[0];

            // questionId must be a non-empty string
            expect(typeof savedQuizResult.questionId).toBe('string');
            expect(savedQuizResult.questionId.length).toBeGreaterThan(0);

            // question must be a non-empty string
            expect(typeof savedQuizResult.question).toBe('string');
            expect(savedQuizResult.question.length).toBeGreaterThan(0);

            // options must be an array of exactly 4 items
            expect(Array.isArray(savedQuizResult.options)).toBe(true);
            expect(savedQuizResult.options).toHaveLength(4);

            // correctAnswer must be a non-empty string and one of the options
            expect(typeof savedQuizResult.correctAnswer).toBe('string');
            expect(savedQuizResult.correctAnswer.length).toBeGreaterThan(0);
            expect(savedQuizResult.options).toContain(savedQuizResult.correctAnswer);

            // userAnswer must match the selectedAnswer
            expect(savedQuizResult.userAnswer).toBe(selectedAnswer);

            // isCorrect must be a boolean matching selectedAnswer === correctAnswer
            expect(typeof savedQuizResult.isCorrect).toBe('boolean');
            expect(savedQuizResult.isCorrect).toBe(selectedAnswer === correctAnswer);

            // explanation must be a non-empty string
            expect(typeof savedQuizResult.explanation).toBe('string');
            expect(savedQuizResult.explanation.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Chat Lambda - Property-Based Tests (Writing Module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  // Feature: english-learning-app, Property 17: WritingReview memiliki struktur lengkap dengan skor valid
  // **Validates: Requirements 9.3, 9.4**
  describe('Property 17: WritingReview has complete structure with valid scores', () => {
    /** Arbitrary for non-empty writing content (printable ASCII) */
    const writingContentArb = fc.stringOf(
      fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
      { minLength: 1, maxLength: 300 }
    );

    /** Arbitrary for a score value 0-100 */
    const scoreArb = fc.integer({ min: 0, max: 100 });

    /** Generate a valid WritingReviewData with arbitrary scores */
    const writingReviewArb = fc.record({
      overallScore: scoreArb,
      grammarScore: scoreArb,
      structureScore: scoreArb,
      vocabularyScore: scoreArb,
    }).map(({ overallScore, grammarScore, structureScore, vocabularyScore }) => ({
      overallScore,
      aspects: {
        grammarCorrectness: {
          score: grammarScore,
          errors: [{ text: 'He go to school', correction: 'He goes to school', explanation: 'Subject-verb agreement' }],
        },
        structure: {
          score: structureScore,
          feedback: 'Good paragraph organization with clear topic sentences.',
        },
        vocabulary: {
          score: vocabularyScore,
          suggestions: ['Use more varied transition words'],
        },
      },
    }));

    test('For any non-empty writing content, writing_review returns a WritingReview with complete structure and all scores in 0-100 range', async () => {
      await fc.assert(
        fc.asyncProperty(writingContentArb, writingReviewArb, async (writingContent, mockReview) => {
          jest.clearAllMocks();

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user-id-123',
                  sessionId: 'writing-session-1',
                  type: 'writing',
                  writingType: 'essay',
                  writingPrompt: 'Describe your career goals.',
                },
              });
            }
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: JSON.stringify(mockReview) }] })
                ),
              });
            }
            // UpdateCommand
            return Promise.resolve({});
          });

          const event = createEvent({
            action: 'writing_review',
            sessionId: 'writing-session-1',
            writingContent,
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          const review = body.writingReview;

          // writingReview must exist
          expect(review).toBeDefined();

          // overallScore must be a number between 0-100
          expect(typeof review.overallScore).toBe('number');
          expect(review.overallScore).toBeGreaterThanOrEqual(0);
          expect(review.overallScore).toBeLessThanOrEqual(100);

          // aspects must exist
          expect(review.aspects).toBeDefined();

          // grammarCorrectness aspect: score 0-100 and errors array
          expect(review.aspects.grammarCorrectness).toBeDefined();
          expect(typeof review.aspects.grammarCorrectness.score).toBe('number');
          expect(review.aspects.grammarCorrectness.score).toBeGreaterThanOrEqual(0);
          expect(review.aspects.grammarCorrectness.score).toBeLessThanOrEqual(100);
          expect(Array.isArray(review.aspects.grammarCorrectness.errors)).toBe(true);

          // Each grammar error has text, correction, and explanation
          for (const error of review.aspects.grammarCorrectness.errors) {
            expect(typeof error.text).toBe('string');
            expect(error.text.length).toBeGreaterThan(0);
            expect(typeof error.correction).toBe('string');
            expect(error.correction.length).toBeGreaterThan(0);
            expect(typeof error.explanation).toBe('string');
            expect(error.explanation.length).toBeGreaterThan(0);
          }

          // structure aspect: score 0-100 and feedback string
          expect(review.aspects.structure).toBeDefined();
          expect(typeof review.aspects.structure.score).toBe('number');
          expect(review.aspects.structure.score).toBeGreaterThanOrEqual(0);
          expect(review.aspects.structure.score).toBeLessThanOrEqual(100);
          expect(typeof review.aspects.structure.feedback).toBe('string');
          expect(review.aspects.structure.feedback.length).toBeGreaterThan(0);

          // vocabulary aspect: score 0-100 and suggestions array
          expect(review.aspects.vocabulary).toBeDefined();
          expect(typeof review.aspects.vocabulary.score).toBe('number');
          expect(review.aspects.vocabulary.score).toBeGreaterThanOrEqual(0);
          expect(review.aspects.vocabulary.score).toBeLessThanOrEqual(100);
          expect(Array.isArray(review.aspects.vocabulary.suggestions)).toBe(true);
          expect(review.aspects.vocabulary.suggestions.length).toBeGreaterThan(0);

          // Each vocabulary suggestion is a non-empty string
          for (const suggestion of review.aspects.vocabulary.suggestions) {
            expect(typeof suggestion).toBe('string');
            expect(suggestion.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: english-learning-app, Property 18: Tulisan dan review tersimpan di Database
  // **Validates: Requirements 9.5**
  describe('Property 18: Writing and review are saved to Database', () => {
    /** Arbitrary for non-empty writing content (printable ASCII) */
    const writingContentArb = fc.stringOf(
      fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
      { minLength: 1, maxLength: 300 }
    );

    /** Arbitrary for a score value 0-100 */
    const scoreArb = fc.integer({ min: 0, max: 100 });

    /** Arbitrary for a sessionId (lowercase alpha, 5-20 chars) */
    const sessionIdArb = fc.stringOf(
      fc.char().filter(c => c.charCodeAt(0) >= 97 && c.charCodeAt(0) <= 122),
      { minLength: 5, maxLength: 20 }
    );

    /** Generate a valid WritingReviewData with arbitrary scores */
    const writingReviewArb = fc.record({
      overallScore: scoreArb,
      grammarScore: scoreArb,
      structureScore: scoreArb,
      vocabularyScore: scoreArb,
    }).map(({ overallScore, grammarScore, structureScore, vocabularyScore }) => ({
      overallScore,
      aspects: {
        grammarCorrectness: {
          score: grammarScore,
          errors: [{ text: 'He go to school', correction: 'He goes to school', explanation: 'Subject-verb agreement' }],
        },
        structure: {
          score: structureScore,
          feedback: 'Good paragraph organization with clear topic sentences.',
        },
        vocabulary: {
          score: vocabularyScore,
          suggestions: ['Use more varied transition words'],
        },
      },
    }));

    test('For any writing content, writing_review UpdateCommand saves userWriting, writingReview, status=completed, and updatedAt to the correct table and session', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await fc.assert(
        fc.asyncProperty(
          writingContentArb,
          writingReviewArb,
          sessionIdArb,
          async (writingContent, mockReview, sessionId) => {
            jest.clearAllMocks();

            mockSend.mockImplementation((command: { _type?: string }) => {
              if (command._type === 'GetCommand') {
                return Promise.resolve({
                  Item: {
                    userId: 'test-user-id-123',
                    sessionId,
                    type: 'writing',
                    writingType: 'essay',
                    writingPrompt: 'Describe your career goals.',
                  },
                });
              }
              if (command._type === 'InvokeModelCommand') {
                return Promise.resolve({
                  body: new TextEncoder().encode(
                    JSON.stringify({ content: [{ text: JSON.stringify(mockReview) }] })
                  ),
                });
              }
              // UpdateCommand
              return Promise.resolve({});
            });

            const event = createEvent({
              action: 'writing_review',
              sessionId,
              writingContent,
            });
            await handler(event);

            // UpdateCommand must have been called exactly once
            expect(UpdateCommand).toHaveBeenCalledTimes(1);
            const updateCall = UpdateCommand.mock.calls[0][0];

            // Targets the correct table
            expect(updateCall.TableName).toBe('test-sessions-table');

            // Targets the correct userId and sessionId
            expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId });

            // Saves the original user writing
            expect(updateCall.ExpressionAttributeValues[':userWriting']).toBe(writingContent);

            // Saves the writing review data
            expect(updateCall.ExpressionAttributeValues[':writingReview']).toEqual(mockReview);

            // Sets status to 'completed'
            expect(updateCall.ExpressionAttributeValues[':status']).toBe('completed');

            // Sets updatedAt to a valid ISO 8601 timestamp
            const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
            expect(updateCall.ExpressionAttributeValues[':updatedAt']).toMatch(ISO_8601_REGEX);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
