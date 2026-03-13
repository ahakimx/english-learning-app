# English Learning App 🎓

Aplikasi web untuk belajar bahasa Inggris yang dirancang khusus untuk persiapan interview kerja. Dibangun dengan React + TypeScript di frontend dan arsitektur serverless AWS di backend.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Arsitektur](#arsitektur)
- [Prasyarat](#prasyarat)
- [Instalasi & Setup](#instalasi--setup)
- [Menjalankan Aplikasi (Lokal)](#menjalankan-aplikasi-lokal)
- [Deploy ke AWS](#deploy-ke-aws)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Panduan Penggunaan](#panduan-penggunaan)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Struktur Proyek](#struktur-proyek)
- [Troubleshooting](#troubleshooting)

---

## Fitur Utama

### 🎤 Speaking Module — Simulasi Interview AI
- Pilih posisi pekerjaan (Software Engineer, Product Manager, Data Analyst, dll.)
- AI menghasilkan pertanyaan interview yang relevan
- Pertanyaan dibacakan menggunakan Amazon Polly (Neural voice)
- Rekam jawaban via mikrofon, otomatis di-transkripsi oleh Amazon Transcribe
- Dapatkan feedback detail dari AI: grammar, vocabulary, relevance, filler words, coherence
- Summary report di akhir sesi dengan skor dan rekomendasi

### 📝 Grammar Module — Quiz Multiple Choice
- Pilih topik: Tenses, Articles, Prepositions, Conditionals, Passive Voice
- Soal quiz di-generate oleh AI dengan 4 pilihan jawaban
- Penjelasan AI untuk setiap jawaban (benar/salah) beserta aturan grammar

### ✍️ Writing Module — Latihan Menulis dengan AI Review
- Pilih tipe tulisan: Essay atau Email
- AI memberikan prompt/topik tulisan
- Review otomatis mencakup: grammar correctness, structure, vocabulary
- Skor dan saran perbaikan spesifik

### 📊 Progress Tracking
- Statistik ringkasan per modul (total sesi, rata-rata skor)
- Grafik tren skor dari waktu ke waktu
- Skor per topik grammar

---

## Tech Stack

| Layer | Teknologi | Docs |
|-------|-----------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS | |
| Routing | react-router-dom | |
| Auth & Storage | aws-amplify (Cognito, S3) | [Amplify + Cognito Auth](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/authenticate-react-app-users-cognito-amplify-ui.html) |
| Backend | AWS Lambda (Node.js/TypeScript) | [Lambda TypeScript Handler](https://docs.aws.amazon.com/lambda/latest/dg/typescript-handler.html) |
| API | API Gateway REST | [API Gateway REST API + Lambda](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-create-api-as-simple-proxy-for-lambda.html) |
| AI | Amazon Bedrock (Claude Haiku) | [Bedrock Model Access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) |
| Speech-to-Text | Amazon Transcribe | [Transcribe Getting Started](https://docs.aws.amazon.com/transcribe/latest/dg/getting-started.html) |
| Text-to-Speech | Amazon Polly (Neural voices) | [Polly Neural Voices](https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html) |
| Database | Amazon DynamoDB | [DynamoDB Getting Started](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html) |
| File Storage | Amazon S3 | [S3 Uploading Objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html) |
| Infrastructure | AWS CDK (TypeScript) | [CDK TypeScript Guide](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html) |
| Hosting | AWS Amplify Hosting | [Deploy Web App on Amplify](https://docs.aws.amazon.com/hands-on/latest/deploy-webapp-amplify/deploy-webapp-amplify.html) |
| Testing | Vitest, Jest, React Testing Library, fast-check | |

---

## Arsitektur

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                   │
│              AWS Amplify Hosting / Vite              │
└──────────────┬──────────────────────┬───────────────┘
               │ HTTPS + JWT          │ Cognito Auth
               ▼                      ▼
┌──────────────────────┐   ┌──────────────────────┐
│    API Gateway REST  │   │   Amazon Cognito      │
│  /chat /transcribe   │   │   (User Pool)         │
│  /speak /progress    │   └──────────────────────┘
└──────┬───┬───┬───┬───┘
       │   │   │   │
       ▼   ▼   ▼   ▼
┌──────┐┌──────┐┌──────┐┌──────┐
│ Chat ││Trans-││Speak ││Prog- │  ← Lambda Functions
│      ││cribe ││      ││ress  │
└──┬───┘└──┬───┘└──┬───┘└──┬───┘
   │       │       │       │
   ▼       ▼       ▼       ▼
Bedrock  Transcribe Polly  DynamoDB
DynamoDB  S3
```

### CDK Stacks

| Stack | Deskripsi |
|-------|-----------|
| `AuthStack` | Cognito User Pool & Client |
| `StorageStack` | DynamoDB (Sessions + Progress) & S3 (Audio) |
| `ApiStack` | API Gateway + 4 Lambda functions |
| `FrontendStack` | Amplify Hosting |

---

## Prasyarat

Pastikan tools berikut sudah terinstall:

- **Node.js** >= 18.x — [Download](https://nodejs.org/)
- **npm** >= 9.x (sudah termasuk di Node.js)
- **AWS CLI** v2 — [Install & Configure Guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)
- **AWS CDK CLI** — `npm install -g aws-cdk` — [CDK Getting Started](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
- **AWS Account** dengan akses ke:
  - Amazon Bedrock (Claude Haiku model harus di-enable di region yang digunakan)
  - Amazon Cognito, Amazon Transcribe, Amazon Polly
  - DynamoDB, S3, Lambda, API Gateway

### Enable Amazon Bedrock Model

Sejak update terbaru, akses ke model foundation di Amazon Bedrock sudah otomatis tersedia selama IAM role Anda memiliki permission AWS Marketplace yang benar (`aws-marketplace:Subscribe`, `aws-marketplace:Unsubscribe`, `aws-marketplace:ViewSubscriptions`). Namun untuk model Anthropic, ada satu langkah tambahan yang wajib dilakukan.

Referensi: [Access Amazon Bedrock foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

#### Langkah 1: Submit Use Case Details (Wajib untuk Anthropic — Sekali per Akun)

Anthropic mewajibkan pelanggan baru untuk submit use case details sebelum bisa menggunakan model mereka. Ini hanya perlu dilakukan **sekali per akun AWS** (atau sekali di management account organisasi). Informasi yang Anda kirimkan akan dibagikan ke Anthropic.

1. Buka [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Pilih region (misal: `us-east-1`)
3. Buka **Model catalog** dan pilih salah satu model Anthropic (misal: Claude Haiku)
4. Anda akan diminta mengisi formulir **use case details**:
   - Deskripsi use case (misal: "Educational web application for English language learning and job interview preparation")
   - Informasi perusahaan/organisasi
5. Submit formulir tersebut
6. Akses ke model langsung diberikan setelah use case details berhasil di-submit

> **Catatan**: Submission di root account/management account akan diwariskan ke semua akun lain dalam AWS Organization yang sama. Anda juga bisa melakukan ini secara programmatic via API [`PutUseCaseForModelAccess`](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_PutUseCaseForModelAccess.html).

#### Langkah 2: Verifikasi Akses Model

1. Di Bedrock Console, buka **Model catalog**
2. Cari **Claude 3 Haiku**
3. Klik model dan coba buka di **Playground** untuk memastikan model bisa digunakan
4. Jika muncul `AccessDeniedException`, pastikan:
   - IAM role memiliki permission AWS Marketplace (`aws-marketplace:Subscribe`, `aws-marketplace:ViewSubscriptions`)
   - Use case details sudah di-submit (Langkah 1)
   - Akun AWS memiliki payment method yang valid
   - Tunggu hingga 2 menit setelah permission diberikan (auto-subscription bisa memakan waktu hingga 15 menit)

#### Langkah 3: Pastikan IAM Permission

IAM role yang digunakan untuk deploy CDK dan menjalankan Lambda harus memiliki permission berikut:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "aws-marketplace:Subscribe",
        "aws-marketplace:Unsubscribe",
        "aws-marketplace:ViewSubscriptions"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "*"
    }
  ]
}
```

> **Catatan**: Permission `aws-marketplace:Subscribe` hanya diperlukan saat pertama kali model digunakan di akun. Setelah model ter-enable, semua user di akun bisa invoke model tanpa permission Marketplace.

---

## Instalasi & Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd english-learning-app
```

### 2. Install Dependencies

```bash
# Frontend dependencies
npm install

# Backend/Infrastructure dependencies
cd infra
npm install
cd ..
```

### 3. Konfigurasi AWS CLI

```bash
aws configure
# Masukkan:
#   AWS Access Key ID
#   AWS Secret Access Key
#   Default region (misal: us-east-1)
#   Default output format: json
```

### 4. Bootstrap CDK (sekali saja per region/account)

```bash
cd infra
npx cdk bootstrap
cd ..
```

---

## Deploy ke AWS

### Deploy Semua Stack (Backend + Frontend)

```bash
cd infra
npx cdk deploy --all --require-approval never
```

Atau deploy satu per satu sesuai urutan dependency:

```bash
cd infra

# 1. Auth (tidak ada dependency)
npx cdk deploy EnglishLearningApp-AuthStack

# 2. Storage (tidak ada dependency)
npx cdk deploy EnglishLearningApp-StorageStack

# 3. API (depends on Auth + Storage)
npx cdk deploy EnglishLearningApp-ApiStack

# 4. Frontend (depends on Auth + Storage + API)
npx cdk deploy EnglishLearningApp-FrontendStack
```

### Catat Output

Setelah deploy, catat output berikut dari terminal:

```
EnglishLearningApp-AuthStack.UserPoolId = us-east-1_xxxxxxxxx
EnglishLearningApp-AuthStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
EnglishLearningApp-AuthStack.IdentityPoolId = us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EnglishLearningApp-ApiStack.ApiUrl = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
EnglishLearningApp-FrontendStack.AmplifyAppId = dxxxxxxxxxx
EnglishLearningApp-FrontendStack.AmplifyAppDefaultDomain = dxxxxxxxxxx.amplifyapp.com
```

---

## Deploy Frontend ke Amplify Hosting

Jika backend sudah di-deploy dan kamu hanya perlu deploy frontend, ikuti langkah berikut.

### Opsi A: Deploy via Amplify Console + GitHub (Rekomendasi)

Cara ini paling mudah dan mendukung auto-deploy setiap `git push`.

#### 1. Deploy FrontendStack via CDK

```bash
cd infra
npx cdk deploy EnglishLearningApp-FrontendStack
```

Catat `AmplifyAppId` dari output.

#### 2. Push code ke GitHub

```bash
git add .
git commit -m "ready for amplify deploy"
git push origin main
```

#### 3. Connect repo di Amplify Console

1. Buka [AWS Amplify Console](https://us-east-1.console.aws.amazon.com/amplify/apps)
2. Cari app **EnglishLearningApp** (sudah dibuat oleh CDK)
3. Klik app → **Hosting** → **Deploy**
4. Pilih **GitHub** sebagai source provider → Authorize
5. Pilih repository dan branch `main`
6. Review build settings (sudah otomatis dari CDK buildSpec):
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: dist
       files:
         - "**/*"
     cache:
       paths:
         - node_modules/**/*
   ```
7. Klik **Save and deploy**

#### 4. Tunggu build selesai

Amplify akan clone repo, install dependencies, build, dan deploy. Proses ini biasanya 2-4 menit.

#### 5. Akses aplikasi

Setelah build selesai, app bisa diakses di:
```
https://main.dxxxxxxxxxx.amplifyapp.com
```

URL ini juga bisa dilihat di Amplify Console.

> Setiap kali kamu `git push` ke branch `main`, Amplify otomatis rebuild dan deploy.

### Opsi B: Manual Deploy dari Lokal (Tanpa GitHub)

Jika belum push ke GitHub atau ingin deploy langsung dari lokal.

#### 1. Build frontend

```bash
npm run build
```

#### 2. Deploy FrontendStack (jika belum)

```bash
cd infra
npx cdk deploy EnglishLearningApp-FrontendStack
```

#### 3. Ambil Amplify App ID

```bash
aws amplify list-apps --region us-east-1 --query "apps[?name=='EnglishLearningApp'].appId" --output text
```

#### 4. Buat deployment dan upload

```bash
# Buat deployment job
aws amplify create-deployment \
  --app-id <APP_ID> \
  --branch-name main \
  --region us-east-1

# Output: jobId dan zipUploadUrl
```

#### 5. Zip dan upload build artifacts

```bash
# Zip folder dist
cd dist
Compress-Archive -Path * -DestinationPath ../deploy.zip
cd ..

# Upload via presigned URL (gunakan zipUploadUrl dari step 4)
curl -T deploy.zip "<zipUploadUrl>"
```

#### 6. Start deployment

```bash
aws amplify start-deployment \
  --app-id <APP_ID> \
  --branch-name main \
  --job-id <JOB_ID> \
  --region us-east-1
```

#### 7. Cek status

```bash
aws amplify get-job \
  --app-id <APP_ID> \
  --branch-name main \
  --job-id <JOB_ID> \
  --region us-east-1
```

### Environment Variables

FrontendStack sudah otomatis meng-inject environment variables dari stack lain:

| Variable | Source | Deskripsi |
|----------|--------|-----------|
| `VITE_API_URL` | ApiStack output | URL API Gateway |
| `VITE_USER_POOL_ID` | AuthStack output | Cognito User Pool ID |
| `VITE_USER_POOL_CLIENT_ID` | AuthStack output | Cognito App Client ID |
| `VITE_IDENTITY_POOL_ID` | AuthStack output | Cognito Identity Pool ID |
| `VITE_AUDIO_BUCKET_NAME` | StorageStack output | S3 bucket untuk audio |
| `VITE_AWS_REGION` | CDK region | AWS Region |

Jika perlu update manual, bisa via Amplify Console:
1. Buka app di Amplify Console
2. **Hosting** → **Environment variables**
3. Edit nilai yang perlu diubah
4. Redeploy branch

### Custom Domain (Opsional)

Untuk menggunakan domain sendiri:

1. Buka app di Amplify Console
2. **Hosting** → **Custom domains**
3. Klik **Add domain**
4. Masukkan domain (misal: `belajar-interview.com`)
5. Amplify akan otomatis provision SSL certificate
6. Update DNS records sesuai instruksi Amplify

### Troubleshooting Amplify Deploy

| Masalah | Solusi |
|---------|--------|
| Build gagal: `npm ci` error | Pastikan `package-lock.json` sudah committed ke repo |
| Build gagal: TypeScript error | Jalankan `npm run build` di lokal dulu untuk cek error |
| Halaman blank setelah deploy | Cek SPA rewrite rule di Amplify Console → Rewrites and redirects |
| Environment variables kosong | Pastikan FrontendStack sudah di-deploy ulang setelah backend stack berubah |
| 403/404 saat akses route | SPA rewrite rule sudah di-setup di CDK, tapi cek di Console jika masih error |
| CORS error | Pastikan API Gateway CORS sudah mengizinkan domain Amplify |

---

## Konfigurasi Environment

Salin `.env.example` menjadi `.env` dan isi dengan output dari deploy:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
VITE_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AUDIO_BUCKET_NAME=englishlearningapp-storagestack-audiobucketxxxxxxxx
VITE_AWS_REGION=us-east-1
```

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `VITE_API_URL` | URL API Gateway (termasuk stage) | `https://xxx.execute-api.us-east-1.amazonaws.com/prod` |
| `VITE_USER_POOL_ID` | Cognito User Pool ID | `us-east-1_AbCdEfGhI` |
| `VITE_USER_POOL_CLIENT_ID` | Cognito App Client ID | `1a2b3c4d5e6f7g8h9i0j` |
| `VITE_AUDIO_BUCKET_NAME` | Nama S3 bucket untuk audio | `englishlearningapp-storagestack-audio123` |
| `VITE_AWS_REGION` | AWS Region | `us-east-1` |

Untuk Amplify Hosting, update environment variables di console Amplify atau via CDK.

---

## Menjalankan Aplikasi (Lokal)

```bash
# Pastikan .env sudah dikonfigurasi
npm run dev
```

Buka browser di `http://localhost:5173`

> **Catatan**: Backend AWS harus sudah di-deploy karena frontend berkomunikasi langsung dengan API Gateway.

### Build untuk Production

```bash
npm run build
```

Output build ada di folder `dist/`.

---

## Panduan Penggunaan

### Registrasi & Login

1. Buka aplikasi → klik **Daftar** di halaman login
2. Masukkan email dan password (minimal 8 karakter, harus ada huruf besar, kecil, angka, dan simbol)
3. Cek email untuk kode verifikasi → masukkan kode
4. Login dengan email dan password yang sudah didaftarkan

### Dashboard

Setelah login, Anda akan melihat dashboard dengan 3 modul:
- **Speaking** 🎤 — Simulasi interview
- **Grammar** 📝 — Quiz grammar
- **Writing** ✍️ — Latihan menulis

Setiap card modul menampilkan progress terakhir Anda.

### Menggunakan Speaking Module

1. Klik card **Speaking** di dashboard
2. Pilih posisi pekerjaan yang ingin dilatih:
   - Software Engineer
   - Product Manager
   - Data Analyst
   - Marketing Manager
   - UI/UX Designer
3. AI akan menghasilkan pertanyaan interview → pertanyaan dibacakan via audio
4. Klik tombol **Rekam** 🔴 untuk mulai menjawab via mikrofon
5. Klik **Stop** untuk berhenti merekam
6. Tunggu proses transkripsi dan analisis AI
7. Lihat feedback detail:
   - Skor per kriteria (grammar, vocabulary, relevance, filler words, coherence)
   - Daftar kesalahan grammar dan koreksinya
   - Filler words yang terdeteksi
   - Saran perbaikan dan contoh jawaban yang lebih baik
8. Klik **Pertanyaan Berikutnya** atau **Akhiri Sesi**
9. Di akhir sesi, lihat Summary Report dengan skor keseluruhan dan rekomendasi

### Menggunakan Grammar Module

1. Klik card **Grammar** di dashboard
2. Pilih topik grammar:
   - Tenses
   - Articles
   - Prepositions
   - Conditionals
   - Passive Voice
3. Jawab soal multiple choice (4 pilihan)
4. Lihat langsung apakah jawaban benar atau salah
5. Baca penjelasan AI tentang aturan grammar yang berlaku
6. Klik **Pertanyaan Berikutnya** untuk lanjut
7. Skor ditampilkan di header (misal: 3/5)

### Menggunakan Writing Module

1. Klik card **Writing** di dashboard
2. Pilih tipe tulisan: **Essay** atau **Email**
3. AI memberikan prompt/topik tulisan
4. Tulis jawaban di editor teks
5. Klik **Kirim untuk Review**
6. Tunggu analisis AI
7. Lihat hasil review:
   - Skor keseluruhan (0-100)
   - Grammar correctness: kesalahan dan koreksi
   - Structure: feedback tentang organisasi tulisan
   - Vocabulary: saran penggunaan kata yang lebih baik
8. Klik **Tulis Lagi** (prompt baru) atau **Ganti Tipe**

### Melihat Progress

1. Klik **Lihat Progress** di header dashboard
2. Lihat statistik ringkasan:
   - Total sesi interview
   - Rata-rata skor speaking
   - Jumlah quiz grammar
   - Jumlah tulisan yang di-review
3. Lihat skor per topik grammar (bar chart)
4. Lihat grafik tren skor speaking dan writing dari waktu ke waktu

---

## API Reference

Base URL: `{VITE_API_URL}` (dari output CDK deploy)

Semua endpoint memerlukan header `Authorization: Bearer {JWT_TOKEN}` dari Cognito.

### POST /chat

Endpoint utama untuk semua interaksi AI.

**Request Body:**

```json
{
  "action": "start_session | analyze_answer | next_question | end_session | grammar_quiz | grammar_explain | writing_prompt | writing_review",
  "sessionId": "uuid (opsional, required untuk action selain start_session/grammar_quiz/writing_prompt)",
  "jobPosition": "string (required untuk start_session)",
  "transcription": "string (required untuk analyze_answer)",
  "grammarTopic": "string (required untuk grammar_quiz/grammar_explain)",
  "selectedAnswer": "string (required untuk grammar_explain)",
  "writingType": "essay | email (required untuk writing_prompt/writing_review)",
  "writingContent": "string (required untuk writing_review)"
}
```

**Response:**

```json
{
  "sessionId": "uuid",
  "type": "question | feedback | summary | quiz | explanation | writing_prompt | writing_review",
  "content": "string",
  "feedbackReport": { },
  "summaryReport": { },
  "quizData": { },
  "writingReview": { }
}
```

### POST /transcribe

Konversi audio ke teks menggunakan Amazon Transcribe.

```json
// Request
{ "audioS3Key": "userId/sessionId/questionId.webm" }

// Response
{ "transcription": "I think my greatest strength is..." }
```

### POST /speak

Konversi teks ke audio menggunakan Amazon Polly Neural.

```json
// Request
{ "text": "What is your greatest strength?" }

// Response
{ "audioData": "base64-encoded-audio-string" }
```

### GET /progress

Ambil data progress user yang sedang login.

```json
{
  "speaking": {
    "totalSessions": 5,
    "averageScore": 72,
    "scoreHistory": [{ "date": "2026-03-01", "score": 68 }]
  },
  "grammar": {
    "totalQuizzes": 20,
    "topicScores": { "Tenses": { "accuracy": 80 } }
  },
  "writing": {
    "totalReviews": 3,
    "averageScore": 75,
    "scoreHistory": [{ "date": "2026-03-02", "score": 75 }]
  }
}
```

### POST /progress

Update data progress setelah aktivitas pembelajaran.

```json
{
  "moduleType": "speaking | grammar | writing",
  "score": 85,
  "sessionId": "uuid",
  "details": {}
}
```

### Error Responses

| Status | Deskripsi |
|--------|-----------|
| 400 | Request tidak valid (parameter missing/salah) |
| 401 | Token tidak valid atau expired |
| 403 | Akses ditolak (mencoba akses data user lain) |
| 404 | Resource tidak ditemukan |
| 408 | Timeout dari AI service |
| 500 | Internal server error |

Format error response:

```json
{ "error": "Bad Request", "message": "Deskripsi error spesifik" }
```

---

## Testing

### Frontend Tests (Vitest)

```bash
npm test
```

Menjalankan 93 tests di 16 test files, mencakup:
- Unit tests untuk semua komponen React
- Property-based tests menggunakan fast-check
- Integration tests

### Backend Tests (Jest)

```bash
cd infra
npm test
```

Menjalankan CDK assertion tests dan Lambda handler tests.

### Menjalankan Test Tertentu

```bash
# Frontend - file tertentu
npx vitest --run src/components/speaking/SpeakingModule.test.tsx

# Backend - file tertentu
cd infra
npx jest test/chat-handler.test.ts
```

---

## Struktur Proyek

```
english-learning-app/
├── src/                              # Frontend React
│   ├── components/
│   │   ├── auth/                     # Login, Register, ProtectedRoute
│   │   ├── dashboard/                # Dashboard, ModuleCard, ProgressOverview
│   │   ├── speaking/                 # Interview simulation (7 komponen)
│   │   ├── grammar/                  # Quiz grammar (4 komponen)
│   │   ├── writing/                  # Latihan menulis (4 komponen)
│   │   └── progress/                 # Progress tracking (2 komponen)
│   ├── hooks/                        # useAuth, useAudioRecorder
│   ├── services/                     # apiClient, authService, audioService
│   ├── types/                        # TypeScript interfaces
│   ├── config/                       # Amplify configuration
│   └── App.tsx                       # Root component + routing
│
├── infra/                            # AWS CDK Infrastructure
│   ├── bin/app.ts                    # CDK app entry point
│   ├── lib/
│   │   ├── auth-stack.ts             # Cognito
│   │   ├── api-stack.ts              # API Gateway + Lambda
│   │   ├── storage-stack.ts          # DynamoDB + S3
│   │   └── frontend-stack.ts         # Amplify Hosting
│   ├── lambda/
│   │   ├── chat/index.ts             # AI interactions (Bedrock)
│   │   ├── transcribe/index.ts       # Speech-to-text
│   │   ├── speak/index.ts            # Text-to-speech
│   │   └── progress/index.ts         # Progress CRUD
│   └── test/                         # Backend tests
│
├── .env.example                      # Template environment variables
├── package.json                      # Frontend dependencies
├── vite.config.ts                    # Vite + Vitest config
└── tsconfig.json                     # TypeScript config
```

---

## Troubleshooting

### "Koneksi terputus" / Network Error
- Pastikan `.env` sudah dikonfigurasi dengan benar
- Pastikan backend sudah di-deploy (`cd infra && npx cdk deploy --all`)
- Cek apakah API Gateway URL bisa diakses

### "Sesi Anda telah berakhir"
- Token Cognito sudah expired → login ulang
- Aplikasi otomatis mencoba refresh token, tapi jika refresh token juga expired, perlu login ulang

### Mikrofon tidak terdeteksi
- Pastikan browser memiliki izin akses mikrofon
- Cek Settings browser → Privacy → Microphone
- Gunakan HTTPS (mikrofon tidak bisa diakses via HTTP kecuali localhost)

### AI analysis timeout
- Amazon Bedrock kadang membutuhkan waktu lebih lama
- Klik "Coba lagi" jika muncul pesan timeout
- Pastikan model Claude Haiku sudah di-enable di region yang digunakan

### CDK Deploy gagal
- Pastikan `aws configure` sudah benar
- Jalankan `npx cdk bootstrap` jika belum pernah
- Cek IAM permissions: memerlukan akses ke CloudFormation, Lambda, API Gateway, Cognito, DynamoDB, S3, Bedrock, Transcribe, Polly

### Build error di frontend
- Pastikan Node.js >= 18
- Hapus `node_modules` dan install ulang: `rm -rf node_modules && npm install`
- Pastikan semua environment variables di `.env` terisi

---

## Referensi AWS Documentation

Dokumentasi resmi AWS untuk setiap service yang digunakan:

| Service | Dokumentasi |
|---------|-------------|
| AWS CDK v2 | [Working with CDK in TypeScript](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html) · [CDK CLI Reference](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) · [First CDK App Tutorial](https://docs.aws.amazon.com/cdk/v2/guide/hello-world.html) |
| Amazon Cognito | [Getting Started with User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/getting-started-user-pools.html) · [User Attributes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html) |
| API Gateway | [REST API + Lambda Tutorial](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-create-api-as-simple-proxy-for-lambda.html) · [CORS for REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html) · [Access Control (Cognito Authorizer)](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html) |
| AWS Lambda | [TypeScript Handler](https://docs.aws.amazon.com/lambda/latest/dg/typescript-handler.html) · [Building with TypeScript](https://docs.aws.amazon.com/lambda/latest/dg/lambda-typescript.html) · [Node.js Handler](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html) |
| Amazon Bedrock | [Model Access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) · [Anthropic Claude Models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html) · [PutUseCaseForModelAccess API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_PutUseCaseForModelAccess.html) |
| Amazon Transcribe | [Getting Started](https://docs.aws.amazon.com/transcribe/latest/dg/getting-started.html) · [Batch Transcription](https://docs.aws.amazon.com/transcribe/latest/dg/getting-started-med-console-batch.html) |
| Amazon Polly | [Neural Voices](https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html) · [Synthesize Speech Example](https://docs.aws.amazon.com/polly/latest/dg/synthesize-example.html) |
| Amazon DynamoDB | [Getting Started](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html) · [Core Components](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html) |
| Amazon S3 | [Uploading Objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html) · [Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html) |
| AWS Amplify Hosting | [Deploy Web App Tutorial](https://docs.aws.amazon.com/hands-on/latest/deploy-webapp-amplify/deploy-webapp-amplify.html) |
| Amplify + React Auth | [Authenticate React App with Cognito](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/authenticate-react-app-users-cognito-amplify-ui.html) |
| AWS CLI | [Getting Started](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) |

---

## Lisensi

Private project.
