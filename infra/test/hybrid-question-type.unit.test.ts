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

import { handler, determineQuestionType, buildContextualPrompt, routeAction } from '../lambda/chat/index';

describe('Hybrid Question Type - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  // --- 10.1: determineQuestionType returns 'random' for empty array ---
  describe('determineQuestionType', () => {
    test('returns random for empty questions array', () => {
      expect(determineQuestionType([])).toBe('random');
    });
  });

  // --- 10.2: handleStartSession stores questionType: 'random' ---
  describe('handleStartSession stores questionType: random', () => {
    test('stores questionType random in DynamoDB and returns it in response', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({
                content: [{ text: 'Tell me about your experience.' }],
              })
            ),
          });
        }
        return Promise.resolve({});
      });

      const result = await routeAction('test-user', {
        action: 'start_session',
        jobPosition: 'Software Engineer',
      });

      // Verify response includes questionType: 'random'
      expect(result.questionType).toBe('random');
      expect(result.type).toBe('question');

      // Verify PutCommand was called with questionType in the first question
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      expect(PutCommand).toHaveBeenCalledTimes(1);
      const putParams = PutCommand.mock.calls[0][0];
      expect(putParams.Item.questions).toHaveLength(1);
      expect(putParams.Item.questions[0].questionType).toBe('random');
    });
  });

  // --- 10.3: handleNextQuestion integration test ---
  describe('handleNextQuestion integration with questionType', () => {
    test('returns questionType in response and stores it in DynamoDB update', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user',
              sessionId: 'test-session',
              jobPosition: 'Software Engineer',
              seniorityLevel: 'mid',
              questionCategory: 'general',
              questions: [
                {
                  questionId: 'q1',
                  questionText: 'Tell me about yourself',
                  questionType: 'random',
                  transcription: 'I have 5 years of experience in software development.',
                },
              ],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({
                content: [{ text: 'Can you elaborate on your experience?' }],
              })
            ),
          });
        }
        return Promise.resolve({});
      });

      const result = await routeAction('test-user', {
        action: 'next_question',
        sessionId: 'test-session',
      });

      // Verify response has questionType
      expect(result.questionType).toBeDefined();
      expect(['contextual', 'random']).toContain(result.questionType);
      expect(result.type).toBe('question');

      // Verify UpdateCommand was called with questionType in the new question
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateParams = UpdateCommand.mock.calls[0][0];
      const newQuestion = updateParams.ExpressionAttributeValues[':newQuestion'];
      expect(newQuestion).toHaveLength(1);
      expect(['contextual', 'random']).toContain(newQuestion[0].questionType);

      // Verify response questionType matches what was stored
      expect(result.questionType).toBe(newQuestion[0].questionType);
    });
  });

  // --- 10.4: buildContextualPrompt returns exactly 3 pairs for 5+ questions ---
  describe('buildContextualPrompt', () => {
    test('returns exactly 3 Q/A pairs when session has 5+ answered questions', () => {
      const questions = [
        { questionText: 'Question 1', transcription: 'Answer 1' },
        { questionText: 'Question 2', transcription: 'Answer 2' },
        { questionText: 'Question 3', transcription: 'Answer 3' },
        { questionText: 'Question 4', transcription: 'Answer 4' },
        { questionText: 'Question 5', transcription: 'Answer 5' },
      ];

      const prompt = buildContextualPrompt(
        'Software Engineer',
        'mid',
        'general',
        questions,
        questions.map(q => q.questionText)
      );

      // Count Q/A labels — should be exactly 3
      const qLabels = prompt.match(/Q\d+:/g) || [];
      const aLabels = prompt.match(/A\d+:/g) || [];
      expect(qLabels).toHaveLength(3);
      expect(aLabels).toHaveLength(3);

      // Verify the 3 most recent pairs are included (not the first 2)
      expect(prompt).toContain('Question 3');
      expect(prompt).toContain('Answer 3');
      expect(prompt).toContain('Question 4');
      expect(prompt).toContain('Answer 4');
      expect(prompt).toContain('Question 5');
      expect(prompt).toContain('Answer 5');

      // The first 2 should NOT appear as Q/A pairs in the conversation context
      // (they may appear in the "do not repeat" list, but not as labeled Q/A pairs)
      // Check that Q1/A1 labels map to Question 3/Answer 3, not Question 1/Answer 1
      const q1Match = prompt.match(/Q1:\s*(.+)/);
      expect(q1Match).toBeTruthy();
      expect(q1Match![1]).toContain('Question 3');
    });
  });

  // --- 10.5: Backward compatibility with old question format ---
  describe('backward compatibility', () => {
    test('session with old question format (no questionType) processes correctly', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user',
              sessionId: 'old-session',
              jobPosition: 'Data Analyst',
              questions: [
                {
                  questionId: 'q1',
                  questionText: 'Tell me about your data analysis experience',
                  // No questionType field — old format
                  transcription: 'I have worked with SQL and Python for 3 years.',
                },
                {
                  questionId: 'q2',
                  questionText: 'What tools do you use?',
                  // No questionType field — old format
                  transcription: 'I primarily use Pandas and Tableau.',
                },
              ],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({
                content: [{ text: 'How do you handle missing data in your analyses?' }],
              })
            ),
          });
        }
        return Promise.resolve({});
      });

      // Should not throw any errors
      const result = await routeAction('test-user', {
        action: 'next_question',
        sessionId: 'old-session',
      });

      // Verify it succeeds
      expect(result.type).toBe('question');
      expect(result.content).toBeDefined();

      // Verify response has questionType field
      expect(result.questionType).toBeDefined();
      expect(['contextual', 'random']).toContain(result.questionType);
    });
  });
});
