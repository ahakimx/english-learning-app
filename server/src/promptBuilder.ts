/**
 * Prompt builder for Nova Sonic AI interviewer.
 * Adapted from infra/lambda/websocket/nova-sonic/promptBuilder.ts for the local proxy server.
 */

export type SeniorityLevel = 'junior' | 'mid' | 'senior' | 'lead';
export type QuestionCategory = 'general' | 'technical';
export type SessionMode = 'quick' | 'targeted';

export interface JobDescriptionContext {
  company: string;
  role: string;
  technologies: string[];
  responsibilities: string[];
  requirements: string[];
  softSkills: string[];
  suggestedSeniority: SeniorityLevel;
  suggestedCategory: QuestionCategory;
  userNotes: string;
}

/**
 * Seniority-appropriate introduction instructions for the AI interviewer.
 */
const INTRODUCTION_INSTRUCTIONS: Record<SeniorityLevel, string> = {
  junior:
    'Start the interview by warmly greeting the candidate and asking them to introduce themselves, including their educational background and any relevant experience or projects that prepared them for this role.',
  mid:
    'Start the interview by greeting the candidate professionally and asking them to walk through their professional experience, highlighting key achievements relevant to this role.',
  senior:
    'Start the interview by greeting the candidate and asking them to describe their career journey, focusing on leadership experiences and significant technical contributions.',
  lead:
    'Start the interview by greeting the candidate and asking them to share their experience leading teams, driving technical strategy, and delivering large-scale projects.',
};

/**
 * Builds the Quick-mode system prompt. This is the exact body of the pre-feature
 * `buildSystemPrompt` and MUST remain byte-for-byte identical so Quick-mode output
 * does not regress when Targeted Mode is layered on top.
 */
function buildQuickSystemPrompt(
  jobPosition: string,
  seniorityLevel: SeniorityLevel,
  questionCategory: QuestionCategory,
): string {
  const categoryInstructions =
    questionCategory === 'general'
      ? `Focus your questions on behavioral, soft skills, and motivation topics. Ask about teamwork, communication, problem-solving approaches, conflict resolution, leadership potential, and career motivation. Explore how the candidate handles challenges, works with others, and stays motivated in their role.`
      : `Focus your questions on technical topics specific to the ${jobPosition} role. Ask about relevant technologies, tools, frameworks, system design, coding practices, debugging strategies, and domain-specific knowledge appropriate for a ${seniorityLevel}-level candidate.`;

  const introductionInstruction = INTRODUCTION_INSTRUCTIONS[seniorityLevel];

  return `You are a professional job interviewer conducting a ${seniorityLevel}-level interview for a ${jobPosition} position. Your questionCategory is ${questionCategory}.

Persona and voice:
- Speak in clear, professional English.
- Maintain a friendly but professional tone throughout the interview.
- Listen actively and respond naturally to the candidate's answers.
- Ask one question at a time and wait for the candidate to finish before moving on.

Interview instructions:
- ${introductionInstruction}
- After the introduction, proceed with follow-up questions based on the candidate's responses.
- ${categoryInstructions}
- Adapt your questions to the ${seniorityLevel} seniority level, adjusting complexity and expectations accordingly.
- Reference specific details from the candidate's previous answers when asking follow-up questions.
- Keep the conversation flowing naturally, as in a real interview.
- Do not repeat questions that have already been asked.
- Provide brief, encouraging acknowledgments before transitioning to the next question.`;
}

/**
 * Builds a system prompt for Amazon Nova Sonic that defines the AI interviewer persona
 * and configures the interview session based on the given parameters.
 *
 * When `mode === 'targeted'` and `jdContext` is provided, a JD context block is appended
 * to the Quick-mode prompt and `userNotes` (if non-empty) are incorporated as additional
 * candidate context. Otherwise the Quick-mode prompt is returned unchanged.
 *
 * This function is total: it never throws and always returns a non-empty string.
 */
// Defensive field accessors — tolerate malformed runtime inputs so the function
// satisfies Requirement 7.5 (totality). A field that isn't the expected type
// is treated as if it were empty, which makes the targeted branch degrade
// gracefully rather than throw.
function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function buildSystemPrompt(
  jobPosition: string,
  seniorityLevel: SeniorityLevel,
  questionCategory: QuestionCategory,
  mode?: SessionMode,
  jdContext?: JobDescriptionContext,
): string {
  // Quick mode (or mode absent / jdContext absent / jdContext not a plain object)
  // → existing logic unchanged. Guarding against arrays and non-objects preserves
  // totality when upstream hands us a malformed payload.
  if (
    mode !== 'targeted' ||
    !jdContext ||
    typeof jdContext !== 'object' ||
    Array.isArray(jdContext)
  ) {
    return buildQuickSystemPrompt(jobPosition, seniorityLevel, questionCategory);
  }

  // Narrow through safe accessors so a well-formed JobDescriptionContext is
  // byte-identical to the prior implementation while malformed inputs degrade
  // to empty strings/arrays instead of throwing.
  const company = safeString(jdContext.company);
  const role = safeString(jdContext.role);
  const technologies = safeStringArray(jdContext.technologies);
  const responsibilities = safeStringArray(jdContext.responsibilities);
  const requirements = safeStringArray(jdContext.requirements);
  const softSkills = safeStringArray(jdContext.softSkills);
  const userNotes = safeString(jdContext.userNotes);

  // Targeted mode: build on the Quick prompt, preferring the JD role when present.
  const base = buildQuickSystemPrompt(
    role || jobPosition,
    seniorityLevel,
    questionCategory,
  );

  const sections: string[] = [];
  if (company) sections.push(`Company: ${company}`);
  if (role) sections.push(`Role: ${role}`);
  if (technologies.length > 0)
    sections.push(`Technologies mentioned in the JD: ${technologies.join(', ')}`);
  if (responsibilities.length > 0)
    sections.push(`Responsibilities: ${responsibilities.map((r, i) => `(${i + 1}) ${r}`).join(' ')}`);
  if (requirements.length > 0)
    sections.push(`Requirements: ${requirements.map((r, i) => `(${i + 1}) ${r}`).join(' ')}`);
  if (softSkills.length > 0)
    sections.push(`Soft skills emphasized: ${softSkills.join(', ')}`);

  const jdBlock = sections.length > 0
    ? `\n\nTargeted Interview Context (extracted from the candidate's actual job description):\n${sections.join('\n')}\n\nWhen asking follow-up questions, explicitly tie them to these technologies, responsibilities, and requirements. Reference the company name when appropriate.`
    : '';

  const notesBlock = userNotes && userNotes.trim() !== ''
    ? `\n\nAdditional notes from the candidate about themselves:\n${userNotes}`
    : '';

  return base + jdBlock + notesBlock;
}
