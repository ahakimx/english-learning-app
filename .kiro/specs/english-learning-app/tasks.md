# Rencana Implementasi: English Learning App

## Ringkasan

Implementasi aplikasi web English Learning untuk persiapan interview kerja dengan 3 modul (Speaking, Grammar, Writing). Menggunakan React + TypeScript di frontend dan AWS CDK serverless di backend. Setiap task membangun di atas task sebelumnya secara inkremental.

## Tasks

- [x] 1. Setup project structure dan core types
  - [x] 1.1 Inisialisasi project frontend React + TypeScript + Vite + Tailwind CSS
    - Buat project baru dengan `npm create vite` menggunakan template react-ts
    - Install dependencies: tailwindcss, react-router-dom, aws-amplify, fast-check (dev)
    - Konfigurasi Tailwind CSS dan setup routing dasar di `App.tsx`
    - _Requirements: 2.1_

  - [x] 1.2 Inisialisasi project CDK untuk infrastruktur
    - Buat folder `infra/` dengan `cdk init app --language typescript`
    - Buat file stub untuk 4 stack: `auth-stack.ts`, `api-stack.ts`, `storage-stack.ts`, `frontend-stack.ts`
    - Definisikan interface antar stack (`AuthStackOutputs`, `StorageStackOutputs`, `ApiStackProps`)
    - _Requirements: 11.1_

  - [x] 1.3 Definisikan TypeScript type definitions bersama (shared types)
    - Buat file `src/types/index.ts` dengan semua interface: `ChatRequest`, `ChatResponse`, `FeedbackReport`, `SummaryReport`, `QuizData`, `WritingReviewData`, `ProgressData`
    - Buat file `infra/lib/types.ts` untuk shared types backend
    - _Requirements: 5.1, 5.2, 7.1, 8.2, 9.3, 11.2_

- [x] 2. Implementasi infrastruktur CDK (Storage & Auth)
  - [x] 2.1 Implementasi Storage Stack (DynamoDB + S3)
    - Buat DynamoDB table `EnglishLearningApp-Sessions` dengan partition key `userId` dan sort key `sessionId`, serta GSI `sessionId-index`
    - Buat DynamoDB table `EnglishLearningApp-Progress` dengan partition key `userId` dan sort key `moduleType`
    - Buat S3 bucket untuk audio files dengan CORS configuration dan enkripsi
    - Konfigurasi S3 bucket policy untuk membatasi akses per user
    - _Requirements: 11.5, 12.3_

  - [x] 2.2 Implementasi Auth Stack (Cognito)
    - Buat Cognito User Pool dengan email sebagai username dan password policy
    - Buat Cognito User Pool Client untuk frontend
    - Konfigurasi email verification
    - Export `userPoolId`, `userPoolClientId`, `userPoolArn`
    - _Requirements: 1.1, 1.2_

- [x] 3. Implementasi infrastruktur CDK (API & Lambda)
  - [x] 3.1 Implementasi API Stack - API Gateway dan Lambda functions
    - Buat REST API Gateway dengan Cognito Authorizer
    - Buat 4 Lambda functions: `/chat`, `/transcribe`, `/speak`, `/progress`
    - Konfigurasi IAM roles untuk setiap Lambda (Bedrock, Transcribe, Polly, DynamoDB, S3)
    - Hubungkan API Gateway routes ke Lambda functions
    - _Requirements: 11.1, 11.3, 12.1_

  - [x] 3.2 Implementasi Frontend Stack (Amplify Hosting)
    - Konfigurasi AWS Amplify Hosting untuk React app
    - Setup environment variables untuk API endpoint dan Cognito config
    - _Requirements: 11.1_

  - [x] 3.3 Tulis unit test untuk CDK stacks
    - Test CDK assertions: jumlah resources, konfigurasi DynamoDB, S3 policies, Lambda permissions, API Gateway routes
    - _Requirements: 11.1, 11.3, 11.5_

- [x] 4. Checkpoint - Pastikan infrastruktur CDK valid
  - Pastikan semua test pass dan `cdk synth` berhasil, tanyakan ke user jika ada pertanyaan.

- [x] 5. Implementasi Lambda /chat - Core AI Logic
  - [x] 5.1 Implementasi Lambda /chat handler dengan input validation
    - Buat handler utama yang menerima `ChatRequest` dan memvalidasi input (action, required fields per action)
    - Implementasi error handling: return 400 untuk invalid input, 401 untuk unauthorized, 500 untuk server error
    - Implementasi routing berdasarkan `action` field ke fungsi-fungsi terpisah
    - _Requirements: 11.2, 11.4_

  - [x] 5.2 Implementasi action `start_session` - Memulai sesi interview
    - Generate sessionId (UUID v4), simpan metadata sesi ke DynamoDB (userId, sessionId, jobPosition, status='active', timestamps)
    - Panggil Amazon Bedrock (Claude Haiku) untuk generate pertanyaan interview pertama berdasarkan posisi pekerjaan
    - Return pertanyaan interview dalam ChatResponse
    - _Requirements: 3.2, 3.3_

  - [x] 5.3 Implementasi action `analyze_answer` - Analisis jawaban user
    - Terima transkripsi jawaban user dan kirim ke Amazon Bedrock untuk analisis
    - Buat prompt yang meminta analisis 5 kriteria: grammar, vocabulary, relevance, filler words, coherence
    - Parse response Bedrock menjadi `FeedbackReport` dengan skor 0-100, grammar errors, filler words, suggestions, improved answer
    - Simpan FeedbackReport ke DynamoDB terkait session dan question
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 5.4 Implementasi action `next_question` dan `end_session`
    - `next_question`: Generate pertanyaan baru yang berbeda dari pertanyaan sebelumnya dalam sesi, kirim daftar pertanyaan sebelumnya ke Bedrock sebagai konteks
    - `end_session`: Generate SummaryReport (overallScore, skor per kriteria, performanceTrend, top 3 improvement areas, recommendations), simpan ke DynamoDB
    - _Requirements: 6.2, 7.1, 7.3_

  - [x] 5.5 Tulis property test untuk pembuatan sesi interview
    - **Property 4: Pembuatan sesi interview menyimpan metadata dengan benar**
    - **Validates: Requirements 3.2**

  - [x] 5.6 Tulis property test untuk FeedbackReport
    - **Property 8: FeedbackReport memiliki struktur lengkap dengan skor valid**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 5.7 Tulis property test untuk penyimpanan FeedbackReport
    - **Property 9: FeedbackReport tersimpan dan terkait dengan sesi yang benar**
    - **Validates: Requirements 5.4**

  - [x] 5.8 Tulis property test untuk pertanyaan tidak berulang
    - **Property 10: Pertanyaan interview dalam satu sesi tidak berulang**
    - **Validates: Requirements 6.2**

  - [x] 5.9 Tulis property test untuk SummaryReport
    - **Property 11: SummaryReport memiliki struktur lengkap**
    - **Validates: Requirements 7.1**

  - [x] 5.10 Tulis property test untuk penyimpanan SummaryReport
    - **Property 12: SummaryReport tersimpan dan terkait dengan user**
    - **Validates: Requirements 7.3**

- [x] 6. Implementasi Lambda /chat - Grammar & Writing Actions
  - [x] 6.1 Implementasi action `grammar_quiz` dan `grammar_explain`
    - `grammar_quiz`: Panggil Bedrock untuk generate soal multiple choice (4 pilihan, 1 jawaban benar) berdasarkan topik grammar
    - `grammar_explain`: Panggil Bedrock untuk generate penjelasan jawaban benar/salah dengan aturan grammar yang berlaku
    - Simpan hasil quiz ke DynamoDB (session, jawaban user, isCorrect)
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 6.2 Implementasi action `writing_prompt` dan `writing_review`
    - `writing_prompt`: Panggil Bedrock untuk generate prompt tulisan sesuai tipe (essay/email)
    - `writing_review`: Panggil Bedrock untuk analisis tulisan (grammar correctness, structure, vocabulary), parse menjadi `WritingReviewData` dengan skor 0-100
    - Simpan tulisan dan review ke DynamoDB
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 6.3 Tulis property test untuk quiz grammar
    - **Property 13: Quiz grammar menghasilkan soal dengan 4 pilihan dan 1 jawaban benar**
    - **Validates: Requirements 8.2**

  - [x] 6.4 Tulis property test untuk validasi jawaban quiz
    - **Property 14: Validasi jawaban quiz mengembalikan hasil yang benar**
    - **Validates: Requirements 8.3**

  - [x] 6.5 Tulis property test untuk penjelasan jawaban quiz
    - **Property 15: Penjelasan jawaban quiz selalu tersedia**
    - **Validates: Requirements 8.4**

  - [x] 6.6 Tulis property test untuk progress grammar
    - **Property 16: Progress grammar tersimpan per topik**
    - **Validates: Requirements 8.5**

  - [x] 6.7 Tulis property test untuk WritingReview
    - **Property 17: WritingReview memiliki struktur lengkap dengan skor valid**
    - **Validates: Requirements 9.3, 9.4**

  - [x] 6.8 Tulis property test untuk penyimpanan tulisan dan review
    - **Property 18: Tulisan dan review tersimpan di Database**
    - **Validates: Requirements 9.5**

- [x] 7. Implementasi Lambda /transcribe dan /speak
  - [x] 7.1 Implementasi Lambda /transcribe handler
    - Terima S3 key audio dari request, validasi input
    - Panggil Amazon Transcribe untuk start transcription job
    - Poll hasil transkripsi dan return teks ke frontend
    - Implementasi error handling: audio terlalu pendek, format tidak didukung
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 7.2 Implementasi Lambda /speak handler
    - Terima teks dari request, validasi input (non-empty)
    - Panggil Amazon Polly (Neural voice) untuk synthesize speech
    - Return audio data (base64 encoded) ke frontend
    - _Requirements: 3.4_

  - [x] 7.3 Tulis property test untuk transkripsi
    - **Property 7: Transkripsi menghasilkan teks bahasa Inggris**
    - **Validates: Requirements 4.4**

  - [x] 7.4 Tulis property test untuk text-to-speech
    - **Property 5: Text-to-speech menghasilkan audio valid**
    - **Validates: Requirements 3.4**

- [x] 8. Implementasi Lambda /progress
  - [x] 8.1 Implementasi Lambda /progress handler (GET dan POST)
    - GET: Query DynamoDB untuk mengambil progress user (speaking, grammar, writing) berdasarkan userId dari token
    - POST: Update/simpan data progress setelah aktivitas pembelajaran (skor, session count, score history)
    - Validasi bahwa user hanya mengakses data miliknya sendiri (userId dari token === userId di request)
    - _Requirements: 10.1, 10.2, 12.2_

  - [x] 8.2 Tulis property test untuk statistik progress
    - **Property 19: Statistik progress dihitung dengan benar**
    - **Validates: Requirements 10.1, 10.2**

  - [x] 8.3 Tulis property test untuk isolasi data user
    - **Property 22: User hanya dapat mengakses data miliknya sendiri**
    - **Validates: Requirements 12.2**

- [x] 9. Checkpoint - Pastikan semua Lambda functions berfungsi
  - Pastikan semua test pass, tanyakan ke user jika ada pertanyaan.

- [x] 10. Implementasi frontend - Auth dan API Client
  - [x] 10.1 Implementasi auth service dan hooks
    - Buat `src/services/authService.ts`: wrapper Amazon Cognito untuk register, login, logout, refresh token, get current user
    - Buat `src/hooks/useAuth.ts`: React hook untuk state autentikasi (user, isAuthenticated, loading)
    - Buat `src/components/auth/LoginForm.tsx`: form login dengan email/password, tampilkan pesan error generik untuk kredensial salah
    - Buat `src/components/auth/RegisterForm.tsx`: form registrasi dengan validasi email dan password
    - Buat `src/components/auth/ProtectedRoute.tsx`: route guard yang redirect ke login jika belum terautentikasi
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 10.2 Implementasi API client dan service layer
    - Buat `src/services/apiClient.ts`: HTTP client dengan JWT token dari Cognito, auto-refresh token jika expired
    - Implementasi method: `chat()`, `transcribe()`, `speak()`, `getProgress()`, `updateProgress()`
    - Implementasi error handling: retry dengan exponential backoff untuk network errors, handle 401 dengan token refresh
    - Buat `src/services/audioService.ts`: upload audio ke S3 menggunakan presigned URL
    - _Requirements: 1.5, 11.2, 12.1_

  - [x] 10.3 Tulis property test untuk pesan error autentikasi
    - **Property 1: Pesan error autentikasi tidak membocorkan informasi kredensial**
    - **Validates: Requirements 1.3**

  - [x] 10.4 Tulis property test untuk API menolak request tanpa token
    - **Property 3: API menolak request tanpa token valid**
    - **Validates: Requirements 1.5, 12.1**

- [x] 11. Implementasi frontend - Dashboard
  - [x] 11.1 Implementasi halaman dashboard
    - Buat `src/components/dashboard/Dashboard.tsx`: layout utama dengan 3 module cards (Speaking, Grammar, Writing)
    - Buat `src/components/dashboard/ModuleCard.tsx`: card komponen dengan ikon, nama modul, deskripsi, dan progress bar
    - Buat `src/components/dashboard/ProgressOverview.tsx`: ringkasan progress dari semua modul
    - Implementasi navigasi ke masing-masing modul saat card diklik
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 12. Implementasi frontend - Speaking Module
  - [x] 12.1 Implementasi pemilihan posisi dan sesi interview
    - Buat `src/components/speaking/SpeakingModule.tsx`: container utama speaking module
    - Buat `src/components/speaking/JobPositionSelector.tsx`: daftar posisi pekerjaan (Software Engineer, Product Manager, Data Analyst, Marketing Manager, UI/UX Designer)
    - Saat user memilih posisi, panggil API `/chat` dengan action `start_session` dan tampilkan pertanyaan pertama
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 12.2 Implementasi audio recorder dan transkripsi
    - Buat `src/hooks/useAudioRecorder.ts`: hook untuk merekam audio dari mikrofon (MediaRecorder API), handle permissions
    - Buat `src/components/speaking/AudioRecorder.tsx`: UI tombol rekam/stop dengan indikator visual perekaman aktif
    - Setelah stop: upload audio ke S3 via `audioService`, panggil API `/transcribe`, tampilkan hasil transkripsi
    - Buat `src/components/speaking/TranscriptionDisplay.tsx`: tampilkan teks transkripsi
    - Handle error: mikrofon tidak tersedia, audio terlalu pendek, transkripsi gagal
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 12.3 Tulis property test untuk upload audio
    - **Property 6: Upload audio menghasilkan S3 key yang valid**
    - **Validates: Requirements 4.3**

  - [x] 12.4 Implementasi sesi interview aktif dan feedback display
    - Buat `src/components/speaking/InterviewSession.tsx`: orchestrator sesi interview (state machine: idle → listening → recording → processing → feedback)
    - Panggil API `/speak` untuk text-to-speech pertanyaan, putar audio ke user
    - Setelah transkripsi, panggil API `/chat` dengan action `analyze_answer` untuk mendapatkan feedback
    - Buat `src/components/speaking/FeedbackDisplay.tsx`: tampilkan FeedbackReport (skor per kriteria, grammar errors dengan highlight, filler words, suggestions, improved answer)
    - Tampilkan tombol "Pertanyaan Berikutnya" dan "Akhiri Sesi"
    - _Requirements: 3.4, 5.1, 5.2, 5.3, 6.1_

  - [x] 12.5 Implementasi summary report
    - Buat `src/components/speaking/SummaryReport.tsx`: tampilkan SummaryReport dengan skor keseluruhan, skor per kriteria, grafik tren performa, top 3 improvement areas, recommendations
    - Saat user klik "Akhiri Sesi", panggil API `/chat` dengan action `end_session`
    - Tampilkan tombol "Mulai Sesi Baru" dan "Kembali ke Dashboard"
    - Update progress via API `/progress`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 13. Implementasi frontend - Grammar Module
  - [x] 13.1 Implementasi grammar module lengkap
    - Buat `src/components/grammar/GrammarModule.tsx`: container utama grammar module
    - Buat `src/components/grammar/TopicSelector.tsx`: daftar topik grammar (Tenses, Articles, Prepositions, Conditionals, Passive Voice)
    - Buat `src/components/grammar/QuizQuestion.tsx`: tampilkan soal quiz dengan 4 pilihan jawaban, highlight jawaban benar/salah setelah user memilih
    - Buat `src/components/grammar/QuizExplanation.tsx`: tampilkan penjelasan AI tentang jawaban benar/salah dan aturan grammar
    - Saat user pilih topik: panggil API `/chat` dengan action `grammar_quiz`
    - Saat user pilih jawaban: validasi dan panggil API `/chat` dengan action `grammar_explain`
    - Update progress via API `/progress` setelah setiap quiz
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 14. Implementasi frontend - Writing Module
  - [x] 14.1 Implementasi writing module lengkap
    - Buat `src/components/writing/WritingModule.tsx`: container utama writing module
    - Buat `src/components/writing/WritingTypeSelector.tsx`: pilihan tipe tulisan (Essay, Email)
    - Buat `src/components/writing/WritingEditor.tsx`: text editor untuk menulis dengan tombol submit
    - Buat `src/components/writing/WritingReview.tsx`: tampilkan hasil review AI (skor keseluruhan, grammar errors dengan highlight dan koreksi, feedback structure, vocabulary suggestions)
    - Saat user pilih tipe: panggil API `/chat` dengan action `writing_prompt`
    - Saat user submit tulisan: panggil API `/chat` dengan action `writing_review`
    - Update progress via API `/progress`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 15. Implementasi frontend - Progress Page
  - [x] 15.1 Implementasi halaman progress
    - Buat `src/components/progress/ProgressPage.tsx`: halaman progress lengkap dengan statistik per modul
    - Tampilkan: total sesi interview, rata-rata skor speaking, jumlah quiz grammar, jumlah tulisan di-review
    - Buat `src/components/progress/ProgressChart.tsx`: grafik tren skor dari waktu ke waktu untuk setiap modul (gunakan library chart sederhana)
    - Panggil API `/progress` untuk mengambil data progress
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 16. Checkpoint - Pastikan semua modul frontend berfungsi
  - Pastikan semua test pass, tanyakan ke user jika ada pertanyaan.

- [x] 17. Implementasi keamanan dan error handling
  - [x] 17.1 Implementasi validasi otorisasi di semua Lambda functions
    - Tambahkan validasi userId dari Cognito token di setiap Lambda handler
    - Pastikan user hanya bisa akses data miliknya sendiri (bandingkan userId dari token dengan userId di request/data)
    - Return 403 Forbidden jika user mencoba akses data user lain
    - Implementasi S3 bucket policy untuk isolasi file audio per user
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 17.2 Implementasi error handling frontend
    - Tambahkan retry dengan exponential backoff (max 3x) untuk network errors di `apiClient.ts`
    - Implementasi auto-refresh token saat 401 diterima
    - Tambahkan timeout handling (30 detik) untuk AI analysis dengan opsi retry
    - Tampilkan pesan error yang user-friendly untuk setiap skenario error
    - Handle audio recording errors: no permission, device error
    - _Requirements: 4.5, 5.5, 1.3_

  - [x] 17.3 Tulis property test untuk token logout
    - **Property 2: Token logout menjadi tidak valid**
    - **Validates: Requirements 1.4**

  - [x] 17.4 Tulis property test untuk JSON response format
    - **Property 20: Lambda response selalu dalam format JSON valid**
    - **Validates: Requirements 11.2**

  - [x] 17.5 Tulis property test untuk error response
    - **Property 21: Error response memiliki HTTP status code dan pesan yang sesuai**
    - **Validates: Requirements 11.4**

  - [x] 17.6 Tulis property test untuk isolasi file audio S3
    - **Property 23: File audio di S3 hanya dapat diakses oleh pemiliknya**
    - **Validates: Requirements 12.3**

- [x] 18. Wiring dan integrasi akhir
  - [x] 18.1 Hubungkan semua komponen frontend dengan backend
    - Pastikan semua API calls di frontend terhubung ke endpoint yang benar
    - Konfigurasi environment variables frontend (API URL, Cognito config, S3 bucket)
    - Setup routing lengkap di `App.tsx`: login, register, dashboard, speaking, grammar, writing, progress
    - Pastikan ProtectedRoute membungkus semua halaman yang memerlukan autentikasi
    - _Requirements: 1.5, 2.1, 2.2, 11.1_

  - [x] 18.2 Tulis integration tests
    - Test flow autentikasi: register → login → akses protected route → logout
    - Test flow speaking: start session → record → transcribe → feedback → summary
    - Test flow grammar: pilih topik → jawab quiz → lihat penjelasan
    - Test flow writing: pilih tipe → tulis → submit → lihat review
    - _Requirements: 1.1, 1.2, 3.2, 8.2, 9.3_

- [x] 19. Final checkpoint - Pastikan semua test pass
  - Pastikan semua test pass, tanyakan ke user jika ada pertanyaan.

## Catatan

- Task bertanda `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Checkpoint memastikan validasi inkremental di setiap tahap
- Property tests memvalidasi properti kebenaran universal menggunakan fast-check
- Unit tests memvalidasi contoh spesifik dan edge cases
