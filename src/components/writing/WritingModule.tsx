import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chat, updateProgress } from '../../services/apiClient';
import type { WritingReviewData } from '../../types';
import WritingEditor from './WritingEditor';
import WritingReview from './WritingReview';
import Sidebar from '../dashboard/Sidebar';

type Phase = 'select' | 'loading-prompt' | 'writing' | 'submitting' | 'review';

export default function WritingModule() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('select');
  const [error, setError] = useState<string | null>(null);
  const [writingType, setWritingType] = useState<'essay' | 'email' | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [reviewData, setReviewData] = useState<WritingReviewData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleSelectType(type: 'essay' | 'email') {
    setPhase('loading-prompt');
    setError(null);
    setWritingType(type);
    setReviewData(null);

    try {
      const response = await chat({ action: 'writing_prompt', writingType: type });
      setPrompt(response.content);
      setSessionId(response.sessionId);
      setPhase('writing');
    } catch {
      setError('Gagal memuat prompt tulisan. Silakan coba lagi.');
      setPhase('select');
    }
  }

  async function handleSubmitWriting(content: string) {
    if (!writingType) return;
    setPhase('submitting');
    setError(null);

    try {
      const response = await chat({
        action: 'writing_review',
        sessionId,
        writingType,
        writingContent: content,
      });

      if (response.writingReview) {
        setReviewData(response.writingReview);
        setPhase('review');

        // Save progress (non-blocking)
        updateProgress({
          moduleType: 'writing',
          score: response.writingReview.overallScore,
          sessionId,
        }).catch(() => {});
      } else {
        setError('Gagal mendapatkan review. Silakan coba lagi.');
        setPhase('writing');
      }
    } catch {
      setError('Gagal mengirim tulisan untuk review. Silakan coba lagi.');
      setPhase('writing');
    }
  }

  function handleWriteAgain() {
    setReviewData(null);
    setPrompt('');
    setPhase('loading-prompt');
    setError(null);
    if (writingType) {
      handleSelectType(writingType);
    }
  }

  function handleChangeType() {
    setPhase('select');
    setWritingType(null);
    setPrompt('');
    setReviewData(null);
    setSessionId('');
    setError(null);
  }

  return (
    <div className="min-h-screen bg-surface font-body text-on-surface">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* TopAppBar */}
      <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-[#f8f9fa]/90 backdrop-blur-md flex justify-between items-center px-4 md:px-10 z-50 shadow-sm">
        <div className="flex items-center gap-4 lg:gap-8">
          <button type="button" className="lg:hidden p-2 -ml-2 text-slate-600 cursor-pointer" onClick={() => setSidebarOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          <span className="text-lg md:text-xl font-bold text-[#003461] tracking-tight whitespace-nowrap font-headline">InterviewPrep Pro</span>
          <div className="hidden md:flex gap-6">
            <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Overview</button>
            <button type="button" onClick={() => navigate('/speaking')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Speaking</button>
            <button type="button" onClick={() => navigate('/grammar')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Grammar</button>
            <button type="button" className="text-[#003461] border-b-2 border-[#003461] font-headline font-semibold text-sm h-16 flex items-center">Writing</button>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button type="button" className="p-2 text-slate-500 hover:text-primary transition-colors active:scale-95 duration-150">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button type="button" className="hidden sm:block p-2 text-slate-500 hover:text-primary transition-colors active:scale-95 duration-150">
            <span className="material-symbols-outlined">workspace_premium</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-[#003461] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-outline-variant/30">
            U
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 min-h-screen">
        <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-8 md:space-y-10">
          {error && (
            <div role="alert" className="mb-6 p-4 bg-error-container border border-error/20 rounded-lg text-on-error-container text-sm">
              {error}
            </div>
          )}

          {phase === 'select' && (
            <>
              {/* Hero Header - Gradient Editorial Style */}
              <section className="relative overflow-hidden rounded-xl p-10 bg-gradient-to-br from-primary to-primary-container text-on-primary">
                <div className="relative z-10 space-y-4 max-w-2xl">
                  <span className="inline-block px-3 py-1 bg-tertiary-container/30 text-tertiary-fixed text-[10px] uppercase tracking-widest font-bold rounded-full">Executive Module</span>
                  <h2 className="font-headline text-4xl font-extrabold tracking-tight">Master the Written Pitch</h2>
                  <p className="text-primary-fixed-dim text-lg font-light leading-relaxed">Refine your professional narrative across resumes, high-stakes emails, and cover letters with AI-powered editorial feedback.</p>
                </div>
                <div className="absolute right-0 bottom-0 opacity-10">
                  <span className="material-symbols-outlined text-[240px]">history_edu</span>
                </div>
              </section>

              {/* Bento Grid Layout */}
              <div className="grid grid-cols-12 gap-6">
                {/* Writing Proficiency Sidebar (Left Column) */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                  <div className="bg-surface-container-low p-8 h-full flex flex-col">
                    <h3 className="font-headline text-xl font-bold text-primary mb-6">Writing Proficiency</h3>
                    <div className="flex-1 space-y-8">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Overall Momentum</span>
                          <span className="text-sm font-bold text-tertiary">74%</span>
                        </div>
                        <div className="w-full h-1 bg-surface-variant">
                          <div className="h-full bg-tertiary w-[74%]" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-surface-container-lowest rounded-lg">
                          <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-1">Resumes</p>
                          <p className="text-2xl font-headline font-extrabold text-primary">08</p>
                          <p className="text-[10px] text-tertiary font-medium">Top Tier</p>
                        </div>
                        <div className="p-4 bg-surface-container-lowest rounded-lg">
                          <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-1">Emails</p>
                          <p className="text-2xl font-headline font-extrabold text-primary">12</p>
                          <p className="text-[10px] text-on-surface-variant font-medium">Pending</p>
                        </div>
                      </div>
                      <div className="mt-auto pt-6">
                        <p className="text-sm text-on-surface-variant italic leading-relaxed">"Your tone in formal correspondence has shifted from 'Direct' to 'Authoritative' over the last 3 tasks."</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Active Assignments (Right Column) */}
                <div className="col-span-12 lg:col-span-8 bg-surface-container-low p-8">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h3 className="font-headline text-xl font-bold text-primary">Active Assignments</h3>
                      <p className="text-sm text-on-surface-variant">Prioritized by deadline and impact</p>
                    </div>
                    <button type="button" className="text-sm font-bold text-primary hover:underline transition-all">View Archive</button>
                  </div>
                  <div className="space-y-4">
                    {/* Assignment Card 1 - Essay */}
                    <button
                      type="button"
                      onClick={() => handleSelectType('essay')}
                      className="group flex items-center p-5 bg-surface-container-lowest rounded-lg hover:shadow-md transition-all duration-300 w-full text-left cursor-pointer"
                    >
                      <div className="h-12 w-12 flex items-center justify-center bg-secondary-container text-primary rounded mr-6 shrink-0">
                        <span className="material-symbols-outlined">rocket_launch</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-primary group-hover:text-primary-container transition-colors">Draft your elevator pitch</h4>
                        <p className="text-xs text-on-surface-variant">Focus: Brevity and value proposition (approx. 150 words)</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="inline-block px-2 py-1 bg-error-container text-on-error-container text-[10px] font-bold rounded mb-1">DUE TODAY</span>
                        <p className="text-xs text-on-surface-variant">High Impact</p>
                      </div>
                      <span className="material-symbols-outlined ml-6 text-outline-variant group-hover:text-primary shrink-0">chevron_right</span>
                    </button>

                    {/* Assignment Card 2 - Email */}
                    <button
                      type="button"
                      onClick={() => handleSelectType('email')}
                      className="group flex items-center p-5 bg-surface-container-lowest rounded-lg hover:shadow-md transition-all duration-300 w-full text-left cursor-pointer"
                    >
                      <div className="h-12 w-12 flex items-center justify-center bg-secondary-container text-primary rounded mr-6 shrink-0">
                        <span className="material-symbols-outlined">mail</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-primary group-hover:text-primary-container transition-colors">Write a follow-up email</h4>
                        <p className="text-xs text-on-surface-variant">Scenario: Post-interview with a Fortune 500 CEO</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="inline-block px-2 py-1 bg-surface-variant text-on-surface-variant text-[10px] font-bold rounded mb-1">2 DAYS LEFT</span>
                        <p className="text-xs text-on-surface-variant">Relationship</p>
                      </div>
                      <span className="material-symbols-outlined ml-6 text-outline-variant group-hover:text-primary shrink-0">chevron_right</span>
                    </button>

                    {/* Assignment Card 3 - Locked */}
                    <div className="group flex items-center p-5 bg-surface-container-lowest rounded-lg transition-all duration-300 opacity-60">
                      <div className="h-12 w-12 flex items-center justify-center bg-secondary-container text-primary rounded mr-6 shrink-0">
                        <span className="material-symbols-outlined">description</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-primary">Resume Keyword Optimization</h4>
                        <p className="text-xs text-on-surface-variant">Align your CV with 'VP of Operations' job description</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="inline-block px-2 py-1 bg-surface-variant text-on-surface-variant text-[10px] font-bold rounded mb-1">UPCOMING</span>
                        <p className="text-xs text-on-surface-variant">Analysis</p>
                      </div>
                      <span className="material-symbols-outlined ml-6 text-outline-variant shrink-0">lock</span>
                    </div>
                  </div>
                </div>

                {/* AI Feedback Preview Section (Full Width) */}
                <div className="col-span-12 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row">
                  {/* Writing Input Mockup */}
                  <div className="md:w-2/3 p-8 border-r border-outline-variant/10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">auto_awesome</span>
                        <h3 className="font-headline font-bold text-primary">Recent Submission Feedback</h3>
                      </div>
                      <span className="text-xs font-medium text-on-surface-variant">Document: Cover_Letter_TechCorp.pdf</span>
                    </div>
                    <div className="bg-surface font-mono p-6 rounded text-sm leading-relaxed text-on-surface-variant space-y-4">
                      <p>"I am writing to express my <span className="bg-tertiary-fixed text-on-surface px-1 font-bold">strong interest</span> in the Senior Architect position. My background in <span className="bg-primary-fixed text-on-surface px-1 font-bold underline decoration-2">scaling infrastructure</span> for multi-national firms aligns perfectly with your goals."</p>
                      <p>"Throughout my career, I have <span className="bg-error-container text-on-error-container px-1">tried to always do my best</span> to lead teams effectively."</p>
                    </div>
                  </div>
                  {/* AI Insights */}
                  <div className="md:w-1/3 p-8 bg-surface-container-low">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-6">Editorial Highlights</h4>
                    <ul className="space-y-6">
                      <li className="flex gap-4">
                        <div className="mt-1">
                          <span className="material-symbols-outlined text-tertiary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Precision Verb Choice</p>
                          <p className="text-xs text-on-surface-variant">"Scaling infrastructure" is a high-value keyword for this seniority level.</p>
                        </div>
                      </li>
                      <li className="flex gap-4">
                        <div className="mt-1">
                          <span className="material-symbols-outlined text-error text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Passive Voice Alert</p>
                          <p className="text-xs text-on-surface-variant">"Tried to always do my best" lacks executive presence. Replace with "Spearheaded organizational growth."</p>
                        </div>
                      </li>
                      <li className="flex gap-4">
                        <div className="mt-1">
                          <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Pro Tip</p>
                          <p className="text-xs text-on-surface-variant">Quantify your impact. How many teams? How much growth?</p>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Focus Practice Tracks */}
              <section className="space-y-6">
                <h3 className="font-headline text-xl font-bold text-primary">Focused Practice Tracks</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Track 1 - Resume Crafting → essay */}
                  <button
                    type="button"
                    onClick={() => handleSelectType('essay')}
                    className="group p-6 bg-surface-container-low rounded-lg cursor-pointer hover:bg-white transition-all text-left"
                  >
                    <span className="material-symbols-outlined text-primary mb-4">badge</span>
                    <h4 className="font-bold text-on-surface group-hover:text-primary transition-colors">Resume Crafting</h4>
                    <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">Optimization for Applicant Tracking Systems (ATS) and human recruiters.</p>
                  </button>
                  {/* Track 2 - High-Stakes Emails → email */}
                  <button
                    type="button"
                    onClick={() => handleSelectType('email')}
                    className="group p-6 bg-surface-container-low rounded-lg cursor-pointer hover:bg-white transition-all text-left"
                  >
                    <span className="material-symbols-outlined text-primary mb-4">mark_email_unread</span>
                    <h4 className="font-bold text-on-surface group-hover:text-primary transition-colors">High-Stakes Emails</h4>
                    <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">Negotiations, follow-ups, and cold outreach to decision makers.</p>
                  </button>
                  {/* Track 3 - Cover Letter Logic → essay */}
                  <button
                    type="button"
                    onClick={() => handleSelectType('essay')}
                    className="group p-6 bg-surface-container-low rounded-lg cursor-pointer hover:bg-white transition-all text-left"
                  >
                    <span className="material-symbols-outlined text-primary mb-4">article</span>
                    <h4 className="font-bold text-on-surface group-hover:text-primary transition-colors">Cover Letter Logic</h4>
                    <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">Developing persuasive narratives that bridge CV gaps and highlight vision.</p>
                  </button>
                </div>
              </section>
            </>
          )}

          {(phase === 'loading-prompt' || phase === 'submitting') && (
            <div className="flex flex-col items-center justify-center py-16" role="status">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4" />
              <p className="text-on-surface-variant font-body">
                {phase === 'loading-prompt' ? 'Memuat prompt tulisan...' : 'Menganalisis tulisan Anda...'}
              </p>
            </div>
          )}

          {phase === 'writing' && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 p-6">
              {writingType && (
                <span className="text-sm text-on-surface-variant mb-4 inline-block" data-testid="current-type">
                  Tipe: {writingType === 'essay' ? 'Essay' : 'Email'}
                </span>
              )}
              <WritingEditor prompt={prompt} onSubmit={handleSubmitWriting} />
            </div>
          )}

          {phase === 'review' && reviewData && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 p-6">
              {writingType && (
                <span className="text-sm text-on-surface-variant mb-4 inline-block" data-testid="current-type">
                  Tipe: {writingType === 'essay' ? 'Essay' : 'Email'}
                </span>
              )}
              <WritingReview writingReview={reviewData} />
              <div className="flex gap-3 mt-6 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={handleWriteAgain}
                  className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  data-testid="write-again"
                >
                  Tulis Lagi
                </button>
                <button
                  type="button"
                  onClick={handleChangeType}
                  className="px-4 py-2 bg-surface-container-lowest text-on-surface text-sm font-medium rounded-lg border border-outline-variant/20 hover:bg-surface-container-low transition-colors"
                  data-testid="change-type"
                >
                  Ganti Tipe
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
