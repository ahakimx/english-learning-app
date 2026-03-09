# Dokumen Requirements

## Pendahuluan

Aplikasi web untuk belajar bahasa Inggris yang dirancang khusus untuk persiapan interview kerja. Aplikasi ini memiliki tiga modul utama: Grammar (quiz dan latihan), Writing (latihan menulis dengan AI review), dan Speaking (simulasi interview dengan AI sebagai fitur prioritas utama). Aplikasi menggunakan arsitektur serverless di AWS dengan React frontend, Amazon Bedrock untuk AI, Amazon Transcribe untuk speech-to-text, dan Amazon Polly untuk text-to-speech.

## Glossary

- **Aplikasi**: Aplikasi web English Learning yang di-host di AWS Amplify Hosting
- **User**: Pengguna terdaftar yang telah terautentikasi melalui Amazon Cognito
- **Speaking_Module**: Modul simulasi interview berbasis AI yang menggunakan Amazon Bedrock, Amazon Transcribe, dan Amazon Polly
- **Grammar_Module**: Modul latihan grammar berbasis quiz multiple choice dengan penjelasan AI
- **Writing_Module**: Modul latihan menulis (essay/email) dengan AI review
- **Interview_Session**: Satu sesi lengkap simulasi interview yang terdiri dari beberapa pertanyaan dan feedback
- **AI_Engine**: Layanan Amazon Bedrock (Claude Haiku) yang memproses analisis bahasa, generate pertanyaan, dan memberikan feedback
- **Speech_Service**: Layanan Amazon Polly (Neural voices) yang mengkonversi teks menjadi audio
- **Transcription_Service**: Layanan Amazon Transcribe yang mengkonversi audio user menjadi teks
- **API_Gateway**: AWS API Gateway yang menerima request dari frontend dan meneruskan ke Lambda functions
- **Lambda_Function**: AWS Lambda function yang memproses business logic untuk endpoint /chat, /transcribe, /speak, dan /progress
- **Auth_Service**: Amazon Cognito yang mengelola registrasi, login, dan autentikasi User
- **Database**: Amazon DynamoDB yang menyimpan data User, progress, dan riwayat sesi
- **Storage**: Amazon S3 yang menyimpan file audio rekaman User
- **Feedback_Report**: Laporan analisis jawaban User yang mencakup grammar accuracy, vocabulary level, relevance, filler words, dan saran perbaikan
- **Summary_Report**: Laporan ringkasan di akhir Interview_Session yang mencakup skor keseluruhan dan area yang perlu ditingkatkan
- **Filler_Words**: Kata-kata pengisi yang tidak bermakna dalam jawaban (contoh: "um", "uh", "like", "you know")

## Requirements

### Requirement 1: Registrasi dan Autentikasi User

**User Story:** Sebagai calon pengguna, saya ingin mendaftar dan login ke Aplikasi, sehingga saya dapat mengakses semua modul pembelajaran secara aman.

#### Acceptance Criteria

1. WHEN User mengakses halaman registrasi dan mengisi email serta password yang valid, THE Auth_Service SHALL membuat akun baru dan mengirimkan email verifikasi ke alamat email User
2. WHEN User memasukkan email dan password yang valid di halaman login, THE Auth_Service SHALL mengautentikasi User dan mengembalikan token akses
3. IF User memasukkan kredensial yang tidak valid, THEN THE Auth_Service SHALL menampilkan pesan error "Email atau password salah" tanpa mengungkapkan informasi kredensial mana yang salah
4. WHEN User menekan tombol logout, THE Auth_Service SHALL mencabut token akses dan mengarahkan User ke halaman login
5. THE API_Gateway SHALL memvalidasi token akses pada setiap request yang memerlukan autentikasi sebelum meneruskan request ke Lambda_Function

### Requirement 2: Pemilihan Modul Pembelajaran

**User Story:** Sebagai User, saya ingin memilih modul pembelajaran (Grammar, Writing, atau Speaking), sehingga saya dapat fokus pada area yang ingin saya tingkatkan.

#### Acceptance Criteria

1. WHEN User berhasil login, THE Aplikasi SHALL menampilkan dashboard dengan tiga modul: Grammar, Writing, dan Speaking
2. WHEN User memilih salah satu modul, THE Aplikasi SHALL mengarahkan User ke halaman modul yang dipilih
3. THE Aplikasi SHALL menampilkan progress terakhir User untuk setiap modul di dashboard

### Requirement 3: Memulai Interview Practice (Speaking Module)

**User Story:** Sebagai User, saya ingin memulai sesi latihan interview dengan memilih posisi pekerjaan, sehingga saya mendapatkan pertanyaan yang relevan dengan posisi yang saya targetkan.

#### Acceptance Criteria

1. WHEN User membuka Speaking_Module, THE Aplikasi SHALL menampilkan daftar posisi pekerjaan yang tersedia (minimal: Software Engineer, Product Manager, Data Analyst, Marketing Manager, UI/UX Designer)
2. WHEN User memilih posisi pekerjaan, THE Aplikasi SHALL membuat Interview_Session baru dan menyimpan metadata sesi ke Database
3. WHEN Interview_Session dimulai, THE AI_Engine SHALL menghasilkan pertanyaan interview pertama yang relevan dengan posisi pekerjaan yang dipilih User
4. WHEN AI_Engine menghasilkan pertanyaan interview, THE Speech_Service SHALL mengkonversi teks pertanyaan menjadi audio menggunakan Neural voice dan memutarnya kepada User

### Requirement 4: Perekaman dan Transkripsi Jawaban User

**User Story:** Sebagai User, saya ingin menjawab pertanyaan interview menggunakan mikrofon, sehingga jawaban saya dapat dianalisis oleh AI.

#### Acceptance Criteria

1. WHEN pertanyaan interview selesai diputar, THE Aplikasi SHALL mengaktifkan tombol rekam dan menampilkan indikator visual bahwa mikrofon siap digunakan
2. WHEN User menekan tombol rekam dan mulai berbicara, THE Aplikasi SHALL merekam audio dari mikrofon User dan menampilkan indikator perekaman aktif
3. WHEN User menekan tombol stop rekam, THE Aplikasi SHALL mengunggah file audio ke Storage dan mengirimkan request transkripsi ke Transcription_Service
4. WHEN Transcription_Service menerima file audio, THE Transcription_Service SHALL mengkonversi audio menjadi teks dalam bahasa Inggris dan mengembalikan hasil transkripsi ke Aplikasi
5. IF Transcription_Service gagal memproses audio (audio terlalu pendek, format tidak didukung, atau audio tidak terdeteksi), THEN THE Aplikasi SHALL menampilkan pesan error yang spesifik dan mempersilakan User untuk merekam ulang
6. WHEN hasil transkripsi diterima, THE Aplikasi SHALL menampilkan teks transkripsi kepada User sebelum mengirimkan ke AI_Engine untuk analisis

### Requirement 5: Analisis Jawaban dan Feedback oleh AI

**User Story:** Sebagai User, saya ingin mendapatkan feedback detail dari AI tentang jawaban interview saya, sehingga saya tahu area mana yang perlu diperbaiki.

#### Acceptance Criteria

1. WHEN teks transkripsi jawaban User dikirim ke AI_Engine, THE AI_Engine SHALL menganalisis jawaban berdasarkan lima kriteria: grammar accuracy, vocabulary level, relevance terhadap pertanyaan, filler words detection, dan overall coherence
2. WHEN analisis selesai, THE AI_Engine SHALL menghasilkan Feedback_Report yang berisi: skor numerik (0-100) untuk setiap kriteria, daftar kesalahan grammar yang ditemukan beserta koreksinya, daftar Filler_Words yang terdeteksi beserta jumlahnya, saran perbaikan spesifik, dan contoh jawaban yang lebih baik (improved answer)
3. WHEN Feedback_Report diterima, THE Aplikasi SHALL menampilkan feedback dalam format visual yang terstruktur dengan skor, highlight kesalahan, dan saran perbaikan
4. THE Aplikasi SHALL menyimpan Feedback_Report ke Database yang terkait dengan Interview_Session aktif
5. IF AI_Engine gagal menghasilkan analisis dalam waktu 30 detik, THEN THE Aplikasi SHALL menampilkan pesan timeout dan menawarkan opsi untuk mencoba ulang analisis

### Requirement 6: Navigasi Antar Pertanyaan Interview

**User Story:** Sebagai User, saya ingin melanjutkan ke pertanyaan berikutnya setelah melihat feedback, sehingga saya dapat menyelesaikan sesi interview secara lengkap.

#### Acceptance Criteria

1. WHEN Feedback_Report ditampilkan, THE Aplikasi SHALL menampilkan tombol "Pertanyaan Berikutnya" dan tombol "Akhiri Sesi"
2. WHEN User menekan tombol "Pertanyaan Berikutnya", THE AI_Engine SHALL menghasilkan pertanyaan interview berikutnya yang berbeda dari pertanyaan sebelumnya dalam Interview_Session yang sama
3. WHEN User menekan tombol "Akhiri Sesi" atau telah menjawab semua pertanyaan dalam sesi, THE Aplikasi SHALL mengakhiri Interview_Session dan mengarahkan User ke halaman Summary_Report

### Requirement 7: Summary Report Akhir Sesi Interview

**User Story:** Sebagai User, saya ingin melihat ringkasan performa saya di akhir sesi interview, sehingga saya dapat memahami kekuatan dan kelemahan saya secara keseluruhan.

#### Acceptance Criteria

1. WHEN Interview_Session berakhir, THE AI_Engine SHALL menghasilkan Summary_Report yang berisi: skor rata-rata keseluruhan, skor per kriteria (grammar, vocabulary, relevance, filler words, coherence), tren performa dari pertanyaan pertama hingga terakhir, tiga area utama yang perlu ditingkatkan, dan rekomendasi latihan selanjutnya
2. WHEN Summary_Report dihasilkan, THE Aplikasi SHALL menampilkan Summary_Report dalam format visual dengan grafik atau chart yang menunjukkan distribusi skor
3. THE Aplikasi SHALL menyimpan Summary_Report ke Database dan mengaitkannya dengan profil User
4. WHEN User melihat Summary_Report, THE Aplikasi SHALL menampilkan tombol "Mulai Sesi Baru" dan tombol "Kembali ke Dashboard"

### Requirement 8: Grammar Module - Quiz dan Latihan

**User Story:** Sebagai User, saya ingin berlatih grammar melalui quiz multiple choice, sehingga saya dapat meningkatkan pemahaman grammar bahasa Inggris saya.

#### Acceptance Criteria

1. WHEN User membuka Grammar_Module, THE Aplikasi SHALL menampilkan daftar topik grammar yang tersedia (contoh: Tenses, Articles, Prepositions, Conditionals, Passive Voice)
2. WHEN User memilih topik grammar, THE AI_Engine SHALL menghasilkan soal multiple choice (4 pilihan jawaban) yang relevan dengan topik yang dipilih
3. WHEN User memilih jawaban, THE Aplikasi SHALL menampilkan apakah jawaban benar atau salah secara langsung
4. WHEN jawaban ditampilkan, THE AI_Engine SHALL memberikan penjelasan mengapa jawaban tersebut benar atau salah, termasuk aturan grammar yang berlaku
5. THE Aplikasi SHALL menyimpan skor dan progress User untuk setiap topik grammar ke Database

### Requirement 9: Writing Module - Latihan Menulis dengan AI Review

**User Story:** Sebagai User, saya ingin berlatih menulis essay atau email dalam bahasa Inggris dan mendapatkan review dari AI, sehingga saya dapat meningkatkan kemampuan menulis saya.

#### Acceptance Criteria

1. WHEN User membuka Writing_Module, THE Aplikasi SHALL menampilkan pilihan tipe tulisan: Essay dan Email
2. WHEN User memilih tipe tulisan, THE AI_Engine SHALL menghasilkan prompt atau topik tulisan yang sesuai dengan tipe yang dipilih
3. WHEN User mengirimkan tulisan untuk review, THE AI_Engine SHALL menganalisis tulisan berdasarkan tiga aspek: grammar correctness, structure dan organization, serta vocabulary usage
4. WHEN analisis tulisan selesai, THE Aplikasi SHALL menampilkan hasil review dengan highlight pada bagian yang perlu diperbaiki, saran koreksi spesifik untuk setiap kesalahan, dan skor keseluruhan (0-100)
5. THE Aplikasi SHALL menyimpan tulisan User dan hasil review ke Database

### Requirement 10: Tracking Progress User

**User Story:** Sebagai User, saya ingin melihat progress belajar saya dari waktu ke waktu, sehingga saya dapat memantau perkembangan kemampuan bahasa Inggris saya.

#### Acceptance Criteria

1. THE Aplikasi SHALL menyimpan semua aktivitas pembelajaran User (sesi interview, quiz grammar, latihan writing) ke Database melalui endpoint /progress
2. WHEN User mengakses halaman progress di dashboard, THE Aplikasi SHALL menampilkan statistik ringkasan: total sesi interview yang diselesaikan, rata-rata skor speaking, jumlah quiz grammar yang diselesaikan, dan jumlah tulisan yang di-review
3. WHEN User mengakses halaman progress, THE Aplikasi SHALL menampilkan grafik tren skor dari waktu ke waktu untuk setiap modul

### Requirement 11: Infrastruktur Serverless dan API

**User Story:** Sebagai developer, saya ingin infrastruktur yang scalable dan cost-effective menggunakan arsitektur serverless, sehingga aplikasi dapat melayani User tanpa perlu mengelola server.

#### Acceptance Criteria

1. THE API_Gateway SHALL menyediakan empat endpoint REST: /chat (untuk AI conversation), /transcribe (untuk speech-to-text), /speak (untuk text-to-speech), dan /progress (untuk tracking progress)
2. WHEN API_Gateway menerima request, THE Lambda_Function SHALL memproses request dan mengembalikan response dalam format JSON
3. THE Lambda_Function SHALL terhubung ke AI_Engine, Transcription_Service, Speech_Service, Database, dan Storage sesuai kebutuhan masing-masing endpoint
4. IF Lambda_Function mengalami error saat memproses request, THEN THE Lambda_Function SHALL mengembalikan response error dengan HTTP status code yang sesuai (400 untuk client error, 500 untuk server error) beserta pesan error yang deskriptif
5. THE Database SHALL menyimpan data dengan partition key yang memungkinkan query efisien berdasarkan User ID dan timestamp

### Requirement 12: Keamanan dan Otorisasi

**User Story:** Sebagai User, saya ingin data pembelajaran saya aman dan hanya dapat diakses oleh saya, sehingga privasi saya terjaga.

#### Acceptance Criteria

1. THE API_Gateway SHALL menolak semua request yang tidak menyertakan token autentikasi yang valid dari Auth_Service
2. THE Lambda_Function SHALL memvalidasi bahwa User hanya dapat mengakses data milik User tersebut berdasarkan User ID dari token autentikasi
3. THE Storage SHALL menggunakan kebijakan akses yang membatasi akses file audio hanya kepada User yang mengunggah file tersebut
4. WHEN User mengirimkan data ke API_Gateway, THE API_Gateway SHALL mengenkripsi data dalam transit menggunakan HTTPS/TLS
