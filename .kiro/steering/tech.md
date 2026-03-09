# Tech Stack

## Frontend
- React 18+ with TypeScript
- Vite (build tool and dev server)
- Tailwind CSS (styling)
- react-router-dom (routing)
- aws-amplify (Cognito auth, S3 uploads)
- Chart library for progress trend graphs

## Backend
- AWS Lambda (Node.js/TypeScript) — serverless compute
- API Gateway REST — 4 endpoints: `/chat`, `/transcribe`, `/speak`, `/progress`
- Amazon Cognito — authentication and authorization (JWT tokens)

## AI & Speech Services
- Amazon Bedrock (Claude Haiku) — language analysis, question generation, feedback, quiz, writing review
- Amazon Transcribe — speech-to-text for user audio recordings
- Amazon Polly (Neural voices) — text-to-speech for interview questions

## Data Storage
- Amazon DynamoDB — two tables: `EnglishLearningApp-Sessions`, `EnglishLearningApp-Progress`
- Amazon S3 — audio file storage with per-user access isolation

## Infrastructure
- AWS CDK (TypeScript) — infrastructure as code
- AWS Amplify Hosting — frontend deployment

## Testing
- Vitest + React Testing Library (frontend)
- Jest (backend Lambda + CDK assertions)
- fast-check (property-based testing for correctness properties)
- Playwright (E2E tests)

## Common Commands

```bash
# Frontend
npm create vite@latest          # scaffold new project
npm run dev                     # local dev server
npm run build                   # production build
npm run test                    # run vitest

# CDK Infrastructure
cd infra
npx cdk synth                   # synthesize CloudFormation
npx cdk deploy                  # deploy stacks
npx cdk diff                    # preview changes
npm test                        # run CDK assertion tests

# Backend Lambda tests
cd infra
npm test                        # Jest tests for Lambda handlers
```
