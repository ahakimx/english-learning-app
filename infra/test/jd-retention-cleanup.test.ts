// Unit tests for the JD retention cleanup Lambda.
//
// Task 14.3: Unit tests for the retention Lambda: empty table, single eligible
// item, single fresh item, and paginated scan (two pages).
// _Requirements: 11.4, 11.5_
//
// The handler paginates a Scan on the Sessions table filtered to
//   type='speaking' AND mode='targeted' AND attribute_exists(jdContext)
//   AND updatedAt < :cutoff
// and issues an `UpdateCommand` with `REMOVE jdContext` per eligible item.
// We mock `@aws-sdk/lib-dynamodb` so no AWS calls are made.

// --- Mocks (must be set up before importing the handler) ---

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend })),
  },
  ScanCommand: jest.fn((input: unknown) => ({ __type: 'ScanCommand', input })),
  UpdateCommand: jest.fn((input: unknown) => ({ __type: 'UpdateCommand', input })),
}));

// Env vars are read inside the handler at invocation time, so setting them
// here (before import) is sufficient for all test cases.
process.env.JD_RETENTION_DAYS = '30';
process.env.SESSIONS_TABLE_NAME = 'test-sessions';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

import { handler } from '../lambda/chat/jdRetentionCleanup/index';

// --- Helpers ---

type MockCommand = { __type: 'ScanCommand' | 'UpdateCommand'; input: any };

function getCommandsByType(type: 'ScanCommand' | 'UpdateCommand'): MockCommand[] {
  return mockSend.mock.calls
    .map((call) => call[0] as MockCommand)
    .filter((cmd) => cmd && cmd.__type === type);
}

// --- Tests ---

describe('jdRetentionCleanup handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JD_RETENTION_DAYS = '30';
    process.env.SESSIONS_TABLE_NAME = 'test-sessions';
  });

  test('empty table: scan returns no items and no updates are issued', async () => {
    mockSend.mockImplementation((command: MockCommand) => {
      if (command.__type === 'ScanCommand') {
        return Promise.resolve({ Items: [], LastEvaluatedKey: undefined });
      }
      return Promise.resolve({});
    });

    const result = await handler();

    expect(result).toEqual({ processed: 0 });
    expect(getCommandsByType('ScanCommand')).toHaveLength(1);
    expect(getCommandsByType('UpdateCommand')).toHaveLength(0);
    expect(ScanCommand).toHaveBeenCalledTimes(1);
    expect(UpdateCommand).not.toHaveBeenCalled();

    // Scan must target the configured table name.
    const scanInput = getCommandsByType('ScanCommand')[0].input;
    expect(scanInput.TableName).toBe('test-sessions');
    // First scan has no ExclusiveStartKey.
    expect(scanInput.ExclusiveStartKey).toBeUndefined();
  });

  test('single eligible item: one UpdateCommand with REMOVE jdContext is issued', async () => {
    const eligibleItem = {
      userId: 'user-1',
      sessionId: 'session-1',
      type: 'speaking',
      mode: 'targeted',
      jdContext: { role: 'Engineer' },
      // 60 days old — older than the 30-day retention window.
      updatedAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    };

    mockSend.mockImplementation((command: MockCommand) => {
      if (command.__type === 'ScanCommand') {
        return Promise.resolve({ Items: [eligibleItem], LastEvaluatedKey: undefined });
      }
      if (command.__type === 'UpdateCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await handler();

    expect(result).toEqual({ processed: 1 });

    const updates = getCommandsByType('UpdateCommand');
    expect(updates).toHaveLength(1);

    const updateInput = updates[0].input;
    expect(updateInput.TableName).toBe('test-sessions');
    expect(updateInput.Key).toEqual({ userId: 'user-1', sessionId: 'session-1' });
    expect(updateInput.UpdateExpression).toBe('REMOVE jdContext');
  });

  test('single fresh item: FilterExpression excludes it, no updates are issued', async () => {
    // DynamoDB's FilterExpression drops fresh items before they reach the
    // handler, so Scan returns an empty Items array even though a fresh item
    // conceptually exists in the table. This mirrors real DynamoDB behavior
    // and exercises the handler's empty-page path for the "fresh only" case.
    mockSend.mockImplementation((command: MockCommand) => {
      if (command.__type === 'ScanCommand') {
        return Promise.resolve({ Items: [], LastEvaluatedKey: undefined });
      }
      return Promise.resolve({});
    });

    const result = await handler();

    expect(result).toEqual({ processed: 0 });
    expect(getCommandsByType('UpdateCommand')).toHaveLength(0);
    expect(UpdateCommand).not.toHaveBeenCalled();

    // Sanity: the FilterExpression still includes the cutoff condition so
    // DynamoDB can filter fresh rows.
    const scanInput = getCommandsByType('ScanCommand')[0].input;
    expect(scanInput.FilterExpression).toContain('updatedAt < :cutoff');
    expect(scanInput.ExpressionAttributeValues[':cutoff']).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
  });

  test('paginated scan (two pages): all three eligible items are updated', async () => {
    const item1 = {
      userId: 'user-1',
      sessionId: 'session-1',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const item2 = {
      userId: 'user-2',
      sessionId: 'session-2',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    const item3 = {
      userId: 'user-3',
      sessionId: 'session-3',
      updatedAt: '2024-01-03T00:00:00.000Z',
    };

    const pageCursor = { userId: 'user-2', sessionId: 'session-2' };

    let scanCallCount = 0;
    mockSend.mockImplementation((command: MockCommand) => {
      if (command.__type === 'ScanCommand') {
        scanCallCount += 1;
        if (scanCallCount === 1) {
          return Promise.resolve({
            Items: [item1, item2],
            LastEvaluatedKey: pageCursor,
          });
        }
        return Promise.resolve({
          Items: [item3],
          LastEvaluatedKey: undefined,
        });
      }
      if (command.__type === 'UpdateCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await handler();

    expect(result).toEqual({ processed: 3 });

    // Two scan pages.
    const scans = getCommandsByType('ScanCommand');
    expect(scans).toHaveLength(2);
    expect(scans[0].input.ExclusiveStartKey).toBeUndefined();
    expect(scans[1].input.ExclusiveStartKey).toEqual(pageCursor);

    // One update per item, in order.
    const updates = getCommandsByType('UpdateCommand');
    expect(updates).toHaveLength(3);
    expect(updates.map((u) => u.input.Key)).toEqual([
      { userId: 'user-1', sessionId: 'session-1' },
      { userId: 'user-2', sessionId: 'session-2' },
      { userId: 'user-3', sessionId: 'session-3' },
    ]);
    for (const update of updates) {
      expect(update.input.UpdateExpression).toBe('REMOVE jdContext');
      expect(update.input.TableName).toBe('test-sessions');
    }
  });
});
