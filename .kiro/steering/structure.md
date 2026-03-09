# Project Structure

```
├── src/                          # Frontend React application
│   ├── components/
│   │   ├── auth/                 # LoginForm, RegisterForm, ProtectedRoute
│   │   ├── dashboard/            # Dashboard, ModuleCard, ProgressOverview
│   │   ├── speaking/             # SpeakingModule, JobPositionSelector, InterviewSession,
│   │   │                         # AudioRecorder, TranscriptionDisplay, FeedbackDisplay, SummaryReport
│   │   ├── grammar/              # GrammarModule, TopicSelector, QuizQuestion, QuizExplanation
│   │   ├── writing/              # WritingModule, WritingTypeSelector, WritingEditor, WritingReview
│   │   └── progress/             # ProgressPage, ProgressChart
│   ├── hooks/                    # useAuth, useAudioRecorder, useApi
│   ├── services/                 # apiClient, authService, audioService
│   ├── types/                    # Shared TypeScript interfaces
│   └── App.tsx                   # Root component with routing
│
├── infra/                        # AWS CDK infrastructure
│   ├── bin/
│   │   └── app.ts                # CDK app entry point
│   ├── lib/
│   │   ├── auth-stack.ts         # Cognito User Pool
│   │   ├── api-stack.ts          # API Gateway + 4 Lambda functions
│   │   ├── storage-stack.ts      # DynamoDB tables + S3 bucket
│   │   ├── frontend-stack.ts     # Amplify Hosting
│   │   └── types.ts              # Shared backend types
│   └── cdk.json
│
└── .kiro/
    ├── specs/                    # Feature specs (requirements, design, tasks)
    └── steering/                 # Project guidance files
```

## Conventions

- Frontend components are grouped by feature/module, not by type
- Each module has a top-level container component (e.g. `SpeakingModule.tsx`) that orchestrates child components
- Shared types live in `src/types/index.ts` (frontend) and `infra/lib/types.ts` (backend)
- Lambda handlers are defined within the CDK `api-stack.ts` or in a `lambda/` subfolder under `infra/`
- CDK stacks are split by concern: auth, api, storage, frontend
- Stacks communicate via exported outputs (`AuthStackOutputs`, `StorageStackOutputs`, `ApiStackProps`)
