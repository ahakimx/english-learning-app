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

import { determineQuestionType } from '../lambda/chat/index';
import { QuestionType } from '../lib/types';

// --- Generator ---
// Generate arbitrary questions arrays with various combinations of questionType and transcription.
// Includes 'random' as a string to simulate legacy session data from before the restructure.
const questionArb = fc.record({
  questionType: fc.option(
    fc.constantFrom<QuestionType | 'random'>('introduction', 'contextual', 'random'),
    { nil: undefined }
  ),
  transcription: fc.option(fc.string(), { nil: undefined }),
});

const questionsArrayArb = fc.array(
  questionArb as fc.Arbitrary<{ questionType?: QuestionType; transcription?: string }>
);

// ============================================================================
// Feature: interview-flow-restructure, Property 3: determineQuestionType always returns contextual
// **Validates: Requirements 2.1, 2.2, 4.1**
// ============================================================================
describe('Feature: interview-flow-restructure, Property 3: determineQuestionType always returns contextual', () => {
  test('For any questions array with various combinations of questionType and transcription, determineQuestionType always returns contextual', () => {
    fc.assert(
      fc.property(questionsArrayArb, (questions) => {
        const result = determineQuestionType(questions);
        expect(result).toBe('contextual');
      }),
      { numRuns: 100 }
    );
  });
});
