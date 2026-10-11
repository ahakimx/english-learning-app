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

### 🎤 Speaking Module — Simulasi Interview AI Real-Time
- Percakapan interview **real-time speech-to-speech** menggunakan **Amazon Nova Sonic** (Bedrock bidirectional streaming) — AI berbicara, Anda menjawab, AI merespons secara natural tanpa tombol rekam-stop
- Mendukung **barge-in / interrupt**: Anda bisa menyela AI saat sedang berbicara
- **Mode interview**:
  - **Pilih posisi pekerjaan** (Software Engineer, Product Manager, Data Analyst, dll.) dengan level senioritas
  - **JD Targeting** — paste job description asli, AI menganalisis dan menghasilkan pertanyaan yang relevan dengan JD tersebut
  - **Hybrid questions** — kombinasi pertanyaan umum dan pertanyaan spesifik posisi/JD
- **Resume session** — lanjutkan sesi interview yang belum selesai
- Live transcript percakapan (AI & user) ditampilkan real-time
- Feedback detail per jawaban dari AI: grammar, vocabulary, relevance, filler words, coherence
- Summary report di akhir sesi dengan skor dan rekomendasi

> **Catatan arsitektur**: Streaming audio real-time ditangani oleh proxy server (Socket.IO) yang menjembatani browser ke Amazon Nova Sonic via Bedrock. Pembuatan sesi, analisis feedback per jawaban, dan summary report tetap melalui REST API (`/chat`).

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
| REST API | API Gateway REST | [API Gateway REST API + Lambda](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-create-api-as-simple-proxy-for-lambda.html) |
| Real-Time Speech | **Amazon Nova Sonic** (Bedrock bidirectional streaming) | [InvokeModelWithBidirectionalStream](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithBidirectionalStream.html) |
| Real-Time Transport | Socket.IO proxy server (Express) di EC2 + WebSocket API Gateway | [API Gateway WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html) |
| AI (text) | Amazon Bedrock (Nova Pro / Claude) | [Bedrock Model Access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) |
| Database | Amazon DynamoDB | [DynamoDB Getting Started](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html) |
| File Storage | Amazon S3 | [S3 Uploading Objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html) |
| Compute (proxy) | Amazon EC2 (t3.micro) | [EC2 Getting Started](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html) |
| Infrastructure | AWS CDK (TypeScript) | [CDK TypeScript Guide](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html) |
| Hosting | AWS Amplify Hosting | [Deploy Web App on Amplify](https://docs.aws.amazon.com/hands-on/latest/deploy-webapp-amplify/deploy-webapp-amplify.html) |
| Testing | Vitest, Jest, React Testing Library, fast-check | |

---

## Arsitektur

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend (React)                        │
│                   AWS Amplify Hosting / Vite                   │
└───┬───────────────────────┬──────────────────────┬────────────┘
    │ HTTPS + JWT           │ Socket.IO (audio)    │ Cognito Auth
    │ (REST)                │ real-time            ▼
    ▼                       ▼              ┌──────────────────┐
┌──────────────────────┐  ┌────────────┐  │  Amazon Cognito  │
│   API Gateway REST   │  │  Nova Sonic │  │   (User Pool)    │
│  /chat /transcribe   │  │ Proxy Server│  └──────────────────┘
│  /speak /progress    │  │ (EC2 t3.micro)
└──┬───┬───┬───┬───────┘  └──────┬──────┘
   │   │   │   │                 │ bidirectional stream
   ▼   ▼   ▼   ▼                 ▼
┌──────┐┌──────┐┌──────┐┌──────┐  ┌─────────────────────────┐
│ Chat ││Trans-││Speak ││Prog- │  │   Amazon Bedrock        │
│      ││cribe ││      ││ress  │  │   Nova Sonic (speech)   │
└──┬───┘└──────┘└──────┘└──┬───┘  │   Nova Pro / Claude     │
   │                       │      └─────────────────────────┘
   ▼                       ▼
Bedrock                 DynamoDB
DynamoDB / S3

┌────────────────────────────────────────────────────────────┐
│  WebSocket API Gateway (alternatif real-time path)          │
│  $connect (Auth) · message (NovaSonic) · $disconnect        │
│  → Lambda → Bedrock Nova Sonic + DynamoDB                   │
└────────────────────────────────────────────────────────────┘
```

> **Dua jalur real-time**: aplikasi menyediakan proxy server Socket.IO di EC2 (always-on, tanpa cold start, ~$8/bulan) sebagai jalur utama, dan WebSocket API Gateway + Lambda sebagai jalur serverless alternatif. Keduanya menjembatani audio browser ke Amazon Nova Sonic via Bedrock `InvokeModelWithBidirectionalStream`.

### CDK Stacks

| Stack | Deskripsi |
|-------|-----------|
| `AuthStack` | Cognito User Pool & Client |
| `StorageStack` | DynamoDB (Sessions + Progress) & S3 (Audio) |
| `ApiStack` | API Gateway REST + Lambda functions (`/chat`, `/transcribe`, `/speak`, `/progress`) |
| `WebSocketStack` | WebSocket API Gateway + Lambda (Auth, NovaSonic, Cleanup) untuk real-time speaking |
| `SonicServerStack` | EC2 t3.micro menjalankan proxy server Nova Sonic (Socket.IO) + Elastic IP |
| `FrontendStack` | Amplify Hosting |

---

## Prasyarat

Pastikan tools berikut sudah terinstall:

- **Node.js** >= 18.x — [Download](https://nodejs.org/)
- **npm** >= 9.x (sudah termasuk di Node.js)
- **AWS CLI** v2 — [Install & Configure Guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)
- **AWS CDK CLI** — `npm install -g aws-cdk` — [CDK Getting Started](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
- **AWS Account** dengan akses ke:
  - Amazon Bedrock (model **Amazon Nova Sonic** untuk speech real-time, dan **Nova Pro / Claude** untuk analisis teks — harus di-enable di region yang digunakan)
  - Amazon Cognito
  - DynamoDB, S3, Lambda, API Gateway (REST + WebSocket), EC2

### Enable Amazon Bedrock Model

Sejak update terbaru, akses ke model foundation di Amazon Bedrock sudah otomatis tersedia selama IAM role Anda memiliki permission AWS Marketplace yang benar (`aws-marketplace:Subscribe`, `aws-marketplace:Unsubscribe`, `aws-marketplace:ViewSubscriptions`). Namun untuk model Anthropic, ada satu langkah tambahan yang wajib dilakukan.

Referensi: [Access Amazon Bedrock foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

Aplikasi ini menggunakan **dua model Bedrock**: **Amazon Nova Sonic** (speech-to-speech real-time) dan model teks **Nova Pro / Anthropic Claude** (analisis & feedback). Keduanya perlu di-enable di region yang sama. Model Amazon (Nova) biasanya bisa langsung diaktifkan, sedangkan model Anthropic memerlukan satu langkah tambahan di bawah.

#### Langkah 1: Submit Use Case Details (Wajib untuk Anthropic — Sekali per Akun)

Anthropic mewajibkan pelanggan baru untuk submit use case details sebelum bisa menggunakan model mereka. Ini hanya perlu dilakukan **sekali per akun AWS** (atau sekali di management account organisasi). Informasi yang Anda kirimkan akan dibagikan ke Anthropic.

1. Buka [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Pilih region (misal: `us-east-1`)
3. Buka **Model access** / **Model catalog** dan aktifkan model yang dibutuhkan:
   - **Amazon Nova Sonic** (untuk speech real-time)
   - **Amazon Nova Pro** dan/atau **Anthropic Claude** (untuk analisis teks)
4. Untuk model Anthropic, Anda akan diminta mengisi formulir **use case details**:
   - Deskripsi use case (misal: "Educational web application for English language learning and job interview preparation")
   - Informasi perusahaan/organisasi
5. Submit formulir tersebut
6. Akses ke model langsung diberikan setelah use case details berhasil di-submit

> **Catatan**: Submission di root account/management account akan diwariskan ke semua akun lain dalam AWS Organization yang sama. Anda juga bisa melakukan ini secara programmatic via API [`PutUseCaseForModelAccess`](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_PutUseCaseForModelAccess.html).

#### Langkah 2: Verifikasi Akses Model

1. Di Bedrock Console, buka **Model catalog**
2. Cari **Amazon Nova Sonic** dan model teks (**Nova Pro** / **Claude**)
3. Klik model dan coba buka di **Playground** untuk memastikan model bisa digunakan
4. Jika muncul `AccessDeniedException`, pastikan:
   - IAM role memiliki permission AWS Marketplace (`aws-marketplace:Subscribe`, `aws-marketplace:ViewSubscriptions`)
   - Use case details sudah di-submit untuk model Anthropic (Langkah 1)
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
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithBidirectionalStream"
      ],
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

# Nova Sonic proxy server dependencies
cd server
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

# 3. API REST (depends on Auth + Storage)
npx cdk deploy EnglishLearningApp-ApiStack

# 4. WebSocket API (depends on Auth + Storage) — jalur real-time serverless
npx cdk deploy EnglishLearningApp-WebSocketStack

# 5. Sonic Server (EC2 proxy Nova Sonic, ~$8/bulan / free tier)
npx cdk deploy EnglishLearningApp-SonicServerStack

# 6. Frontend (depends on Auth + Storage + API)
npx cdk deploy EnglishLearningApp-FrontendStack
```

### Deploy Nova Sonic Proxy Server

`SonicServerStack` membuat EC2 t3.micro dengan systemd service, tapi kode server (`server/`) perlu di-deploy ke instance. Setelah stack ter-deploy:

1. Catat `SonicServerPublicIp` / `InstanceId` dari output CDK
2. Deploy kode `server/` ke instance (via SSM Session Manager, `scp`, atau Docker — lihat `server/Dockerfile`)
3. Pastikan service berjalan di port `3001`
4. Set `VITE_SONIC_SERVER_URL=http://<public-ip>:3001` di environment frontend (Amplify console atau `.env`)

### Catat Output

Setelah deploy, catat output berikut dari terminal:

```
EnglishLearningApp-AuthStack.UserPoolId = us-east-1_xxxxxxxxx
EnglishLearningApp-AuthStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
EnglishLearningApp-AuthStack.IdentityPoolId = us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EnglishLearningApp-ApiStack.ApiUrl = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
EnglishLearningApp-WebSocketStack.WebSocketUrl = wss://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/production
EnglishLearningApp-SonicServerStack.SonicServerUrl = http://xx.xx.xx.xx:3001
EnglishLearningApp-SonicServerStack.SonicServerPublicIp = xx.xx.xx.xx
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
| `VITE_API_URL` | ApiStack output | URL API Gateway REST |
| `VITE_WEBSOCKET_URL` | WebSocketStack output | URL WebSocket API (jalur real-time serverless) |
| `VITE_SONIC_SERVER_URL` | SonicServerStack output | URL proxy server Nova Sonic (EC2) — set manual setelah EC2 deploy |
| `VITE_USER_POOL_ID` | AuthStack output | Cognito User Pool ID |
| `VITE_USER_POOL_CLIENT_ID` | AuthStack output | Cognito App Client ID |
| `VITE_IDENTITY_POOL_ID` | AuthStack output | Cognito Identity Pool ID |
| `VITE_AUDIO_BUCKET_NAME` | StorageStack output | S3 bucket untuk audio |
| `VITE_AWS_REGION` | CDK region | AWS Region |

> **Penting**: `VITE_SONIC_SERVER_URL` tidak di-inject otomatis oleh CDK (cross-stack reference EC2). Set manual di Amplify console setelah `SonicServerStack` ter-deploy dan kode server berjalan.

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
VITE_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_AUDIO_BUCKET_NAME=englishlearningapp-storagestack-audiobucketxxxxxxxx
VITE_AWS_REGION=us-east-1

# Nova Sonic proxy server (lokal: http://localhost:3001, produksi: URL EC2/App Runner)
VITE_SONIC_SERVER_URL=http://localhost:3001

# WebSocket URL — OPSIONAL (backward compatibility, tidak lagi wajib untuk speaking module)
VITE_WEBSOCKET_URL=

# Bedrock Model IDs (ubah untuk ganti model AI)
BEDROCK_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0
BEDROCK_TEXT_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `VITE_API_URL` | URL API Gateway REST (termasuk stage) | `https://xxx.execute-api.us-east-1.amazonaws.com/prod` |
| `VITE_SONIC_SERVER_URL` | URL proxy server Nova Sonic (jalur utama speaking) | `http://localhost:3001` / `https://xxx.awsapprunner.com` |
| `VITE_WEBSOCKET_URL` | URL WebSocket API (opsional, backward compatibility) | `wss://xxx.execute-api.us-east-1.amazonaws.com/production` |
| `VITE_USER_POOL_ID` | Cognito User Pool ID | `us-east-1_AbCdEfGhI` |
| `VITE_USER_POOL_CLIENT_ID` | Cognito App Client ID | `1a2b3c4d5e6f7g8h9i0j` |
| `VITE_IDENTITY_POOL_ID` | Cognito Identity Pool ID | `us-east-1:xxxx-xxxx-xxxx` |
| `VITE_AUDIO_BUCKET_NAME` | Nama S3 bucket untuk audio | `englishlearningapp-storagestack-audio123` |
| `VITE_AWS_REGION` | AWS Region | `us-east-1` |
| `BEDROCK_SONIC_MODEL_ID` | Model Nova Sonic (speech) | `amazon.nova-2-sonic-v1:0` |
| `BEDROCK_TEXT_MODEL_ID` | Model teks (analisis/feedback) | `us.anthropic.claude-haiku-4-5-...` |

Untuk Amplify Hosting, update environment variables di console Amplify atau via CDK.

---

## Menjalankan Aplikasi (Lokal)

Speaking module butuh proxy server Nova Sonic berjalan secara lokal. Jalankan frontend + server proxy sekaligus:

```bash
# Pastikan .env (root) dan server/.env sudah dikonfigurasi
npm run dev:all
```

`dev:all` menjalankan frontend (Vite) dan proxy server (`server/`) secara paralel. Atau jalankan terpisah:

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — proxy server Nova Sonic (port 3001)
npm run server
```

Buka browser di `http://localhost:5173`

> **Catatan**:
> - Backend AWS (Auth, Storage, API REST) harus sudah di-deploy karena frontend berkomunikasi langsung dengan API Gateway.
> - Proxy server lokal membutuhkan AWS credentials yang punya akses Bedrock (`InvokeModelWithBidirectionalStream`) untuk Nova Sonic.

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
2. Pilih mode interview:
   - **Berdasarkan Posisi** — pilih posisi pekerjaan (Software Engineer, Product Manager, Data Analyst, Marketing Manager, UI/UX Designer) dan level senioritas
   - **JD Targeting** — paste job description asli, AI menganalisis JD lalu menghasilkan pertanyaan yang relevan
3. Jika ada sesi sebelumnya yang belum selesai, aplikasi menawarkan **Resume Session** untuk melanjutkan
4. Interview berlangsung **real-time speech-to-speech**:
   - AI (Amazon Nova Sonic) langsung berbicara mengajukan pertanyaan
   - Jawab langsung via mikrofon — tidak perlu tombol rekam/stop
   - Anda bisa **menyela (interrupt/barge-in)** saat AI sedang bicara
   - Live transcript percakapan ditampilkan real-time
5. Setiap jawaban dianalisis AI dan menghasilkan feedback:
   - Skor per kriteria (grammar, vocabulary, relevance, filler words, coherence)
   - Daftar kesalahan grammar dan koreksinya
   - Filler words yang terdeteksi
   - Saran perbaikan dan contoh jawaban yang lebih baik
6. Klik **Akhiri Sesi** kapan saja
7. Di akhir sesi, lihat Summary Report dengan skor keseluruhan dan rekomendasi

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
  "action": "start_session | analyze_answer | next_question | end_session | resume_session | abandon_session | analyze_job_description | grammar_quiz | grammar_explain | writing_prompt | writing_review",
  "sessionId": "uuid (opsional, required untuk action berbasis sesi mis. end_session/abandon_session)",
  "jobPosition": "string (required untuk start_session)",
  "seniorityLevel": "junior | mid | senior | lead (opsional untuk start_session)",
  "questionCategory": "string (opsional — kategori pertanyaan)",
  "transcription": "string (required untuk analyze_answer)",
  "jdRawText": "string (required untuk analyze_job_description)",
  "mode": "quick | targeted (required untuk analyze_job_description)",
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
  "type": "question | feedback | summary | quiz | explanation | writing_prompt | writing_review | jd_analysis",
  "content": "string",
  "feedbackReport": { },
  "summaryReport": { },
  "quizData": { },
  "writingReview": { },
  "jdAnalysis": { }
}
```

> **Catatan**: Interaksi audio real-time interview (mengirim audio, menerima audio AI, transcript live) **tidak** lewat `/chat`, melainkan melalui koneksi Socket.IO ke proxy server Nova Sonic (`VITE_SONIC_SERVER_URL`). Endpoint `/chat` menangani lifecycle sesi (`start_session`, `resume_session`, `end_session`), analisis feedback per jawaban (`analyze_answer`), analisis JD (`analyze_job_description`), serta modul Grammar & Writing.

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

### Real-Time Speech (Nova Sonic)

Interview speaking berjalan via **Socket.IO** ke proxy server Nova Sonic (`VITE_SONIC_SERVER_URL`), bukan REST. Event utama:

| Arah | Event | Payload | Deskripsi |
|------|-------|---------|-----------|
| client → server | `startSession` | `{ jobPosition, seniorityLevel, questionCategory }` | Membuka stream Nova Sonic |
| client → server | `audioChunk` | base64 PCM | Mengirim audio mic user |
| client → server | `interrupt` | — | Barge-in / menyela AI |
| client → server | `endSession` | — | Menutup stream |
| server → client | `audioChunk` | base64 PCM | Audio suara AI |
| server → client | `transcript` | `{ role, text, partial }` | Transcript live AI/user |
| server → client | `turnSwitch` | `{ from, to }` | Pergantian giliran bicara |
| server → client | `error` | `{ code, message }` | Error dari Nova Sonic |

> Jalur serverless alternatif tersedia via WebSocket API Gateway (`VITE_WEBSOCKET_URL`) dengan route `$connect` (auth JWT), `message`, dan `$disconnect`.

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

Mencakup unit tests untuk semua komponen React, property-based tests (fast-check), dan integration tests untuk flow tiap modul (Auth, Speaking, Grammar, Writing). Termasuk property tests untuk fitur Nova Sonic speaking, JD targeting, dan session resume.

### Backend Tests (Jest)

```bash
cd infra
npm test
```

Menjalankan CDK assertion tests dan Lambda handler tests, termasuk property-based tests untuk JD targeting, hybrid question type, session resume, dan auto-abandon.

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
│   │   ├── speaking/                 # Interview real-time: ModeSelector, JobPositionSelector,
│   │   │                             # JobDescriptionInput, JDAnalysisReview, InterviewSession,
│   │   │                             # LiveTranscriptPanel, ResumePrompt, FeedbackDisplay, SummaryReport
│   │   ├── grammar/                  # Quiz grammar
│   │   ├── writing/                  # Latihan menulis
│   │   └── progress/                 # Progress tracking
│   ├── hooks/                        # useAuth, useNovaSonic, useAudioCapture, useAudioPlayback, useAudioRecorder
│   ├── services/                     # apiClient, authService, audioService
│   ├── types/                        # TypeScript interfaces
│   ├── config/                       # Amplify configuration
│   └── App.tsx                       # Root component + routing
│
├── server/                           # Nova Sonic proxy server (Express + Socket.IO)
│   ├── src/                          # Server source (bidirectional Bedrock streaming)
│   ├── Dockerfile                    # Container image untuk EC2/App Runner
│   └── package.json
│
├── public/
│   └── audio-playback-processor.js   # AudioWorklet untuk streaming playback Nova Sonic
│
├── scripts/                          # Helper scripts (mis. setup-nginx.sh)
│
├── infra/                            # AWS CDK Infrastructure
│   ├── bin/app.ts                    # CDK app entry point (6 stacks)
│   ├── lib/
│   │   ├── auth-stack.ts             # Cognito
│   │   ├── api-stack.ts              # API Gateway REST + Lambda
│   │   ├── storage-stack.ts          # DynamoDB + S3
│   │   ├── websocket-stack.ts        # WebSocket API + Lambda (Nova Sonic)
│   │   ├── sonic-server-stack.ts     # EC2 proxy Nova Sonic
│   │   ├── apprunner-stack.ts        # (opsional) App Runner deploy untuk proxy
│   │   └── frontend-stack.ts         # Amplify Hosting
│   ├── lambda/
│   │   ├── chat/index.ts             # AI interactions (Bedrock)
│   │   ├── transcribe/index.ts       # Speech-to-text (legacy/utility)
│   │   ├── speak/index.ts            # Text-to-speech (legacy/utility)
│   │   ├── progress/index.ts         # Progress CRUD
│   │   ├── websocket/                # auth, nova-sonic, cleanup handlers
│   │   └── shared/                   # Shared backend utilities
│   └── test/                         # Backend tests
│
├── .env.example                      # Template environment variables
├── package.json                      # Frontend deps + script dev:all (frontend + server)
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
- Pastikan model Nova Pro / Claude (analisis teks) sudah di-enable di region yang digunakan

### Speaking tidak terhubung / "Cannot connect to Nova Sonic server"
- Pastikan proxy server berjalan: `npm run server` (lokal) atau EC2 instance aktif (produksi)
- Cek `VITE_SONIC_SERVER_URL` mengarah ke URL server yang benar
- Pastikan model **Amazon Nova Sonic** sudah di-enable di Bedrock dan IAM punya `bedrock:InvokeModelWithBidirectionalStream`
- Untuk EC2: cek security group mengizinkan port 3001, dan kode server sudah di-deploy ke instance

### CDK Deploy gagal
- Pastikan `aws configure` sudah benar
- Jalankan `npx cdk bootstrap` jika belum pernah
- Cek IAM permissions: memerlukan akses ke CloudFormation, Lambda, API Gateway, Cognito, DynamoDB, S3, EC2, dan Bedrock (`InvokeModel` + `InvokeModelWithBidirectionalStream`)

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
| Amazon Bedrock | [Model Access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) · [InvokeModelWithBidirectionalStream](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithBidirectionalStream.html) · [PutUseCaseForModelAccess API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_PutUseCaseForModelAccess.html) |
| Amazon Nova / Nova Sonic | [Amazon Nova User Guide](https://docs.aws.amazon.com/nova/latest/userguide/what-is-nova.html) |
| API Gateway WebSocket | [WebSocket API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html) · [Manage Connections](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html) |
| Amazon EC2 | [Getting Started](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html) · [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) |
| Amazon DynamoDB | [Getting Started](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html) · [Core Components](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html) |
| Amazon S3 | [Uploading Objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html) · [Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html) |
| AWS Amplify Hosting | [Deploy Web App Tutorial](https://docs.aws.amazon.com/hands-on/latest/deploy-webapp-amplify/deploy-webapp-amplify.html) |
| Amplify + React Auth | [Authenticate React App with Cognito](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/authenticate-react-app-users-cognito-amplify-ui.html) |
| AWS CLI | [Getting Started](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) |

---

## Lisensi

Private project.
