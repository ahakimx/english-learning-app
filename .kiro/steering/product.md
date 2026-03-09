# Product Overview

English Learning App — a web application for practicing English specifically for job interview preparation.

## Core Modules

- **Speaking**: AI-powered interview simulation. User selects a job position, answers questions via microphone, gets transcription and detailed AI feedback (grammar, vocabulary, relevance, filler words, coherence). Ends with a summary report.
- **Grammar**: Multiple-choice quiz on grammar topics (Tenses, Articles, Prepositions, Conditionals, Passive Voice) with AI-generated explanations.
- **Writing**: Essay/email writing practice with AI review covering grammar correctness, structure, and vocabulary.

## Key Characteristics

- Target audience: Indonesian speakers preparing for English job interviews
- UI language: Indonesian (Bahasa Indonesia) for labels and navigation; English for learning content
- All AI interactions powered by Amazon Bedrock (Claude Haiku)
- Speech processing: Amazon Transcribe (speech-to-text) and Amazon Polly Neural (text-to-speech)
- User progress tracking across all modules with score history and trend charts
- Authentication required for all features (Amazon Cognito)
