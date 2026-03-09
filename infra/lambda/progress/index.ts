import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROGRESS_TABLE_NAME = process.env.PROGRESS_TABLE_NAME || '';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const VALID_MODULE_TYPES = ['speaking', 'grammar', 'writing', 'overall'];

function extractUserId(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.claims?.sub ?? null;
}

function successResponse(body: Record<string, unknown>): APIGatewayProxyResult {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, error: string, message: string): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify({ error, message }) };
}


interface ProgressUpdateRequest {
  userId?: string;
  moduleType: string;
  score: number;
  sessionId: string;
  speakingScores?: {
    grammar: number;
    vocabulary: number;
    relevance: number;
    fillerWords: number;
    coherence: number;
  };
  topicScores?: Record<string, {
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
  }>;
  writingScores?: {
    grammarCorrectness: number;
    structure: number;
    vocabulary: number;
  };
}

function validatePostBody(body: Record<string, unknown>): { valid: true; request: ProgressUpdateRequest } | { valid: false; message: string } {
  const { moduleType, score, sessionId } = body;

  if (!moduleType || typeof moduleType !== 'string') {
    return { valid: false, message: 'Missing required field: moduleType' };
  }

  if (!VALID_MODULE_TYPES.includes(moduleType)) {
    return { valid: false, message: `Invalid moduleType: ${moduleType}. Valid types: ${VALID_MODULE_TYPES.join(', ')}` };
  }

  if (score === undefined || score === null || typeof score !== 'number') {
    return { valid: false, message: 'Missing required field: score (must be a number)' };
  }

  if (score < 0 || score > 100) {
    return { valid: false, message: 'Score must be between 0 and 100' };
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, message: 'Missing required field: sessionId' };
  }

  return { valid: true, request: body as unknown as ProgressUpdateRequest };
}


async function handleGet(userId: string): Promise<APIGatewayProxyResult> {
  // Query all progress records for this user
  const result = await docClient.send(
    new QueryCommand({
      TableName: PROGRESS_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    })
  );

  const items = result.Items || [];

  // Build the ProgressData response from DynamoDB items
  const speakingItem = items.find(item => item.moduleType === 'speaking');
  const grammarItem = items.find(item => item.moduleType === 'grammar');
  const writingItem = items.find(item => item.moduleType === 'writing');

  const progressData = {
    speaking: {
      totalSessions: speakingItem?.totalSessions ?? 0,
      averageScore: speakingItem?.averageScore ?? 0,
      scoreHistory: speakingItem?.scoreHistory ?? [],
      speakingScores: speakingItem?.speakingScores ?? undefined,
      lastActivityAt: speakingItem?.lastActivityAt ?? undefined,
    },
    grammar: {
      totalQuizzes: grammarItem?.totalSessions ?? 0,
      topicScores: grammarItem?.topicScores ?? {},
      lastActivityAt: grammarItem?.lastActivityAt ?? undefined,
    },
    writing: {
      totalReviews: writingItem?.totalSessions ?? 0,
      averageScore: writingItem?.averageScore ?? 0,
      scoreHistory: writingItem?.scoreHistory ?? [],
      writingScores: writingItem?.writingScores ?? undefined,
      lastActivityAt: writingItem?.lastActivityAt ?? undefined,
    },
  };

  return successResponse(progressData);
}


async function handlePost(userId: string, request: ProgressUpdateRequest): Promise<APIGatewayProxyResult> {
  // If the request includes a userId field, validate it matches the token userId
  if (request.userId && request.userId !== userId) {
    return errorResponse(403, 'Forbidden', 'Akses ditolak: Anda hanya dapat mengakses data milik Anda sendiri');
  }

  const now = new Date().toISOString();
  const { moduleType, score, sessionId } = request;

  // Try to get existing progress record
  const existing = await docClient.send(
    new GetCommand({
      TableName: PROGRESS_TABLE_NAME,
      Key: { userId, moduleType },
    })
  );

  const newHistoryEntry = { date: now, score, sessionId };

  if (existing.Item) {
    // Update existing record: increment sessions, recalculate average, append to history
    const currentTotal = existing.Item.totalSessions ?? 0;
    const currentAvg = existing.Item.averageScore ?? 0;
    const newTotal = currentTotal + 1;
    const newAvg = Math.round(((currentAvg * currentTotal) + score) / newTotal);

    const updateExprParts = [
      'totalSessions = :newTotal',
      'averageScore = :newAvg',
      'lastActivityAt = :now',
      'scoreHistory = list_append(if_not_exists(scoreHistory, :emptyList), :newHistory)',
    ];
    const exprValues: Record<string, unknown> = {
      ':newTotal': newTotal,
      ':newAvg': newAvg,
      ':now': now,
      ':newHistory': [newHistoryEntry],
      ':emptyList': [],
    };

    // Update module-specific scores if provided
    if (moduleType === 'speaking' && request.speakingScores) {
      updateExprParts.push('speakingScores = :speakingScores');
      exprValues[':speakingScores'] = request.speakingScores;
    }
    if (moduleType === 'grammar' && request.topicScores) {
      updateExprParts.push('topicScores = :topicScores');
      exprValues[':topicScores'] = request.topicScores;
    }
    if (moduleType === 'writing' && request.writingScores) {
      updateExprParts.push('writingScores = :writingScores');
      exprValues[':writingScores'] = request.writingScores;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: PROGRESS_TABLE_NAME,
        Key: { userId, moduleType },
        UpdateExpression: 'SET ' + updateExprParts.join(', '),
        ExpressionAttributeValues: exprValues,
      })
    );
  } else {
    // Create new progress record
    const item: Record<string, unknown> = {
      userId,
      moduleType,
      totalSessions: 1,
      averageScore: score,
      lastActivityAt: now,
      scoreHistory: [newHistoryEntry],
    };

    if (moduleType === 'speaking' && request.speakingScores) {
      item.speakingScores = request.speakingScores;
    }
    if (moduleType === 'grammar' && request.topicScores) {
      item.topicScores = request.topicScores;
    }
    if (moduleType === 'writing' && request.writingScores) {
      item.writingScores = request.writingScores;
    }

    await docClient.send(
      new PutCommand({
        TableName: PROGRESS_TABLE_NAME,
        Item: item,
      })
    );
  }

  return successResponse({ message: 'Progress updated successfully' });
}


export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    // Extract userId from Cognito authorizer
    const userId = extractUserId(event);
    if (!userId) {
      return errorResponse(401, 'Unauthorized', 'Token tidak valid');
    }

    const method = event.httpMethod;

    if (method === 'GET') {
      return await handleGet(userId);
    }

    if (method === 'POST') {
      // Parse request body
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, 'Bad Request', 'Request body harus berupa JSON yang valid');
      }

      // Validate request body
      const validation = validatePostBody(body);
      if (!validation.valid) {
        return errorResponse(400, 'Bad Request', validation.message);
      }

      return await handlePost(userId, validation.request);
    }

    return errorResponse(400, 'Bad Request', `Unsupported method: ${method}`);
  } catch (error) {
    console.error('Progress handler error:', error);
    return errorResponse(500, 'Internal Server Error', 'Terjadi kesalahan internal');
  }
};

// Export for testing
export { extractUserId, validatePostBody, handleGet, handlePost, VALID_MODULE_TYPES };
