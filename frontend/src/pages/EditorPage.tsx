import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import TrialBanner from '../components/TrialBanner'

// ─── Types ───────────────────────────────────────────────────
type AIMode = 'auto_cut' | 'subtitle_only' | 'suggest_edits' | 'chat_edit'
type JobStatus = 'idle' | 'uploading' | 'pending' | 'processing' | 'done' | 'failed'

interface JobResult {
  job_id: string
  status: JobStatus
  progress: number
  subtitle_available: boolean
  suggestions?: any
  has_watermark: boolean
  error?: string
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

// ─── Constants ───────────────────────────────────────────────
const AI_MODES = [
  { id: 'auto_cut', icon: '✂', label: 'Auto Cut', desc: 'Remove silence & filler automatically', color: '#A78BFA' },
  { id: 'subtitle_only', icon: '⌨', label: 'Subtitle', desc: 'Generate subtitles in any language', color: '#60A5FA' },
  { id: 'suggest_edits', icon: '✦', label: 'Suggest Edits', desc: 'AI recommends where to cut', color: '#34D399' },
  { id: 'chat_edit', icon: '💬', label: 'Chat to Edit', desc: 'Describe edits in natural language', color: '#F472B6' },
]

const LANGUAGES = [
  { code: 'auto', label: 'Auto detect' },
  { code: 'th', label: 'Thai / ภาษาไทย' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese / 日本語' },
  { code: 'zh', label: 'Chinese / 中文' },
  { code: 'ko', label: 'Korean / 한국어' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi / हिंदी' },
  { code: 'ru', label: 'Russian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' },
]

// ─── Main Component ──────────────────────────────────────────
export default function EditorPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)
  const logout = useAuthStore(s => s.logout)

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Config state
  const [aiMode, setAiMode] = useState<AIMode>('subtitle_only')
  const [language, setLanguage] = useState('auto')
  const [burnSubtitle, setBurnSubtitle] = useState(false)
  const [subtitleStyle, setSubtitleStyle] = useState('white')

  // Job state
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle')
  const [jobResult, setJobResult] = useState<JobResult | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Chat state
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ─── File handling ───────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('video/')) setFile(f)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  // ─── Upload & process ────────────────────────────────────
  async function handleSubmit() {
    if (!file || !token) return
    setJobStatus('uploading')
    setUploadProgress(0)

    const form = new FormData()
    form.append('file', file)
    form.append('ai_mode', aiMode)
    form.append('subtitle_language', language)
    form.append('burn_subtitle', burnSubtitle ? 'true' : 'false')
    form.append('subtitle_style', subtitleStyle)

    try {
      // Upload with XHR for progress
      const jobId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText).job_id)
          else reject(new Error(xhr.responseText))
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.open('POST', '/api/jobs/upload')
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(form)
      })

      setJobStatus('pending')
      pollJobStatus(jobId)
    } catch (err) {
      setJobStatus('failed')
      setJobResult(prev => ({ ...prev!, error: String(err) }))
    }
  }

  function pollJobStatus(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobId}/status`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        setJobResult(data)
        setJobStatus(data.status)
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(interval)
        }
      } catch { clearInterval(interval) }
    }, 2000)
  }

  // ─── Chat ─────────────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || !jobResult?.job_id || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMsgs(m => [...m, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobResult.job_id}/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: chatMsgs }),
      })
      const data = await res.json()
      setChatMsgs(m => [...m, { role: 'assistant', content: data.response }])
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch {
      setChatMsgs(m => [...m, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    } finally { setChatLoading(false) }
  }

  // ─── Download subtitle ────────────────────────────────────
  async function downloadSRT() {
    if (!jobResult?.job_id) return
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/jobs/${jobResult.job_id}/subtitle`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${file?.name || 'subtitle'}.srt`; a.click()
  }

  const isProcessing = ['uploading', 'pending', 'processing'].includes(jobStatus)
  const isTrial = user?.role === 'trial'

  return (
    <div style={S.wrap}>
      <style>{CSS}</style>

      {/* Nav */}
      <nav style={S.nav}>
        <div style={S.navLogo} onClick={() => navigate('/')}>⬡ COSMIX</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {isTrial && (
            <div style={S.trialChip}>
              ⏳ Trial
            </div>
          )}
          <span style={{ color: '#475569', fontSize: 13 }}>{user?.email}</span>
          <button style={S.navBtn} onClick={() => { logout(); navigate('/login') }}>Sign out</button>
        </div>
      </nav>

      <TrialBanner />

      <div style={S.body}>

        {/* ── LEFT PANEL ── */}
        <div style={S.leftPanel}>

          {/* Upload Zone */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Upload Video</div>
            <div
              style={{ ...S.dropZone, ...(dragOver ? S.dropZoneActive : {}), ...(file ? S.dropZoneFilled : {}) }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !file && fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={onFileChange} />
              {file ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🎬</div>
                  <div style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{file.name}</div>
                  <div style={{ color: '#475569', fontSize: 12 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  {!isProcessing && (
                    <button style={S.changeBtn} onClick={e => { e.stopPropagation(); setFile(null); setJobStatus('idle'); setJobResult(null) }}>
                      Change file
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>⬆</div>
                  <div style={{ color: '#94A3B8', fontSize: 14, marginBottom: 6 }}>Drop video here or click to browse</div>
                  <div style={{ color: '#374151', fontSize: 12 }}>MP4, MOV, AVI — up to 5GB</div>
                </div>
              )}
            </div>
          </div>

          {/* AI Mode Selector */}
          <div style={S.section}>
            <div style={S.sectionTitle}>AI Mode</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AI_MODES.map(m => (
                <button
                  key={m.id}
                  style={{ ...S.modeBtn, ...(aiMode === m.id ? { ...S.modeBtnActive, borderColor: `${m.color}60`, background: `${m.color}12` } : {}) }}
                  onClick={() => setAiMode(m.id as AIMode)}
                >
                  <span style={{ fontSize: 18, width: 28 }}>{m.icon}</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ color: aiMode === m.id ? m.color : '#94A3B8', fontSize: 13, fontWeight: 500 }}>{m.label}</div>
                    <div style={{ color: '#374151', fontSize: 11, marginTop: 1 }}>{m.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Language (show for subtitle/auto_cut/suggest) */}
          {aiMode !== 'chat_edit' && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Subtitle Language</div>
              <select style={S.select} value={language} onChange={e => setLanguage(e.target.value)}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
          )}

          {/* Burn Subtitle Option */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Subtitle Options</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={burnSubtitle} onChange={e => setBurnSubtitle(e.target.checked)}
                style={{ accentColor: '#7C3AED', width: 16, height: 16 }} />
              <span style={{ color: '#94A3B8', fontSize: 13 }}>Burn subtitle into video</span>
            </label>
            {burnSubtitle && (
              <div>
                <div style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Style</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {[
                    { id: 'white', label: 'White' },
                    { id: 'yellow', label: 'Yellow' },
                    { id: 'black_bg', label: 'Black BG' },
                  ].map(s => (
                    <button key={s.id}
                      style={{ background: subtitleStyle === s.id ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.06)', border: `1px solid ${subtitleStyle === s.id ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.2)'}`, color: subtitleStyle === s.id ? '#A78BFA' : '#64748B', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}
                      onClick={() => setSubtitleStyle(s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            style={{ ...S.submitBtn, opacity: (!file || isProcessing) ? 0.5 : 1 }}
            disabled={!file || isProcessing}
            onClick={handleSubmit}
            className="btn-glow"
          >
            {isProcessing ? '⟳ Processing...' : '✦ Start AI Edit'}
          </button>

          {/* Trial watermark notice */}
          {isTrial && (
            <div style={S.watermarkNote}>
              ✦ Trial: output will have watermark
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={S.rightPanel}>

          {/* IDLE state */}
          {jobStatus === 'idle' && (
            <div style={S.emptyState}>
              <div style={{ fontSize: 64, marginBottom: 20, opacity: 0.15 }}>🎬</div>
              <div style={{ color: '#374151', fontSize: 15 }}>Upload a video to get started</div>
              <div style={{ color: '#1F2937', fontSize: 13, marginTop: 8 }}>Select a file and AI mode on the left</div>
            </div>
          )}

          {/* UPLOADING */}
          {jobStatus === 'uploading' && (
            <div style={S.progressWrap}>
              <div style={S.progressTitle}>Uploading video...</div>
              <div style={S.progressBarWrap}>
                <div style={{ ...S.progressBar, width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #7C3AED, #60A5FA)' }} />
              </div>
              <div style={S.progressPct}>{uploadProgress}%</div>
            </div>
          )}

          {/* PENDING / PROCESSING */}
          {(jobStatus === 'pending' || jobStatus === 'processing') && jobResult && (
            <div style={S.progressWrap}>
              <div style={S.progressTitle}>
                {jobStatus === 'pending' ? '⟳ Queued — waiting to process' : '✦ AI is working on your video'}
              </div>
              <div style={S.progressBarWrap}>
                <div style={{ ...S.progressBar, width: `${jobResult.progress}%`, background: 'linear-gradient(90deg, #7C3AED, #A78BFA)', animation: 'shimmer 2s infinite' }} />
              </div>
              <div style={S.progressPct}>{jobResult.progress}%</div>
              <div style={{ color: '#374151', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                {jobResult.progress < 20 && 'Extracting audio...'}
                {jobResult.progress >= 20 && jobResult.progress < 50 && 'Transcribing with Whisper AI...'}
                {jobResult.progress >= 50 && jobResult.progress < 70 && 'Analyzing content with Claude...'}
                {jobResult.progress >= 70 && jobResult.progress < 100 && 'Rendering output...'}
              </div>
            </div>
          )}

          {/* DONE */}
          {jobStatus === 'done' && jobResult && (
            <div style={S.resultWrap}>
              <div style={S.resultHeader}>
                <span style={{ color: '#34D399', fontSize: 20 }}>✓</span>
                <span style={S.resultTitle}>Done!</span>
                {jobResult.has_watermark && (
                  <span style={S.watermarkBadge}>⚠ Watermark applied</span>
                )}
              </div>

              {/* Actions */}
              <div style={S.actionRow}>
                {jobResult.subtitle_available && (
                  <button style={S.actionBtn} onClick={downloadSRT}>
                    ⬇ Download SRT
                  </button>
                )}
                <button style={S.actionBtnPrimary} onClick={() => navigate(`/editor/${jobResult.job_id}`)}>
                  ⬇ Download Video
                </button>
              </div>

              {/* Suggestions */}
              {jobResult.suggestions && (
                <div style={S.suggestBox}>
                  {/* Auto Cut results */}
                  {aiMode === 'auto_cut' && jobResult.suggestions.cuts && (
                    <>
                      <div style={S.suggestTitle}>✂ Auto Cut Results</div>
                      <div style={{ color: '#34D399', fontSize: 13, marginBottom: 12 }}>
                        ✓ Removed {jobResult.suggestions.cuts.length} segments
                        {jobResult.suggestions.estimated_time_saved > 0 && (
                          <span style={{ color: '#64748B' }}> — saved ~{jobResult.suggestions.estimated_time_saved.toFixed(1)}s</span>
                        )}
                      </div>
                      {jobResult.suggestions.cuts.map((cut: any, i: number) => (
                        <div key={i} style={S.cutItem}>
                          <span style={{ color: '#EF4444', fontSize: 12 }}>✂ {cut.start}s → {cut.end}s</span>
                          <span style={{ color: '#475569', fontSize: 12 }}> [{cut.type}] {cut.reason}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {/* Suggest Edits results */}
                  {aiMode === 'suggest_edits' && (
                    <>
                      <div style={S.suggestTitle}>✦ AI Suggestions</div>
                      {jobResult.suggestions.summary && (
                        <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                          {jobResult.suggestions.summary}
                        </p>
                      )}
                      {jobResult.suggestions.suggested_cuts?.map((cut: any, i: number) => (
                        <div key={i} style={S.cutItem}>
                          <span style={{ color: '#A78BFA', fontSize: 12 }}>✂ {cut.start}s → {cut.end}s</span>
                          <span style={{ color: '#475569', fontSize: 12 }}> — {cut.reason}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Chat panel for chat_edit mode */}
              {aiMode === 'chat_edit' && (
                <div style={S.chatWrap}>
                  <div style={S.chatTitle}>💬 Chat to Edit</div>
                  <div style={S.chatMessages}>
                    {chatMsgs.length === 0 && (
                      <div style={{ color: '#374151', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                        Describe what you want to edit — in Thai or English
                      </div>
                    )}
                    {chatMsgs.map((m, i) => (
                      <div key={i} style={{ ...S.chatMsg, ...(m.role === 'user' ? S.chatMsgUser : S.chatMsgAI) }}>
                        {m.content}
                      </div>
                    ))}
                    {chatLoading && <div style={{ ...S.chatMsg, ...S.chatMsgAI, opacity: 0.5 }}>typing...</div>}
                    <div ref={chatEndRef} />
                  </div>
                  <div style={S.chatInputRow}>
                    <input
                      style={S.chatInput}
                      className="cos-input"
                      placeholder="e.g. ตัด intro ออก หรือ add white subtitles"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendChat()}
                    />
                    <button style={S.chatSend} onClick={sendChat} disabled={chatLoading}>→</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FAILED */}
          {jobStatus === 'failed' && (
            <div style={S.errorWrap}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✗</div>
              <div style={{ color: '#FCA5A5', fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Processing failed</div>
              <div style={{ color: '#475569', fontSize: 13 }}>{jobResult?.error || 'Unknown error'}</div>
              <button style={{ ...S.actionBtn, marginTop: 20 }} onClick={() => { setJobStatus('idle'); setJobResult(null) }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
  * { box-sizing: border-box; }
  @keyframes shimmer { 0%{opacity:1} 50%{opacity:0.7} 100%{opacity:1} }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .cos-input:focus { outline:none; border-color:rgba(139,92,246,0.6) !important; box-shadow:0 0 0 3px rgba(124,58,237,0.12); }
  .btn-glow:hover:not(:disabled) { box-shadow:0 0 28px rgba(124,58,237,0.4); transform:translateY(-1px); }
  select option { background:#0D1322; color:#E2E8F0; }
`

// ─── Styles ───────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#060A12', fontFamily: "'DM Sans', sans-serif", color: '#E2E8F0', display: 'flex', flexDirection: 'column' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 32px', borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,12,20,0.9)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 },
  navLogo: { fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer' },
  navBtn: { background: 'transparent', border: '1px solid rgba(139,92,246,0.2)', color: '#64748B', padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  trialChip: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D', fontSize: 11, padding: '3px 10px', borderRadius: 20 },
  body: { display: 'flex', flex: 1, gap: 0 },
  // Left panel
  leftPanel: { width: 300, minWidth: 300, borderRight: '1px solid rgba(139,92,246,0.1)', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' },
  section: { marginBottom: 20 },
  sectionTitle: { color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 },
  // Drop zone
  dropZone: { border: '2px dashed rgba(139,92,246,0.25)', borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: 'rgba(139,92,246,0.02)' },
  dropZoneActive: { border: '2px dashed rgba(139,92,246,0.6)', background: 'rgba(139,92,246,0.06)' },
  dropZoneFilled: { border: '2px dashed rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.04)', cursor: 'default' },
  changeBtn: { background: 'transparent', border: '1px solid rgba(139,92,246,0.25)', color: '#A78BFA', padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginTop: 12, fontFamily: "'DM Sans', sans-serif" },
  // Mode buttons
  modeBtn: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.1)', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s', width: '100%', fontFamily: "'DM Sans', sans-serif" },
  modeBtnActive: { background: 'rgba(139,92,246,0.08)' },
  // Select
  select: { width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '9px 12px', color: '#E2E8F0', fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' },
  // Submit
  submitBtn: { background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '13px', borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s', marginTop: 4 },
  watermarkNote: { color: '#374151', fontSize: 11, textAlign: 'center', padding: '8px 0' },
  // Right panel
  rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' },
  // Progress
  progressWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' },
  progressTitle: { color: '#94A3B8', fontSize: 16, marginBottom: 24, textAlign: 'center' },
  progressBarWrap: { width: '100%', maxWidth: 400, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressBar: { height: '100%', borderRadius: 3, transition: 'width 0.5s ease' },
  progressPct: { color: '#A78BFA', fontSize: 24, fontFamily: "'Syne', sans-serif", fontWeight: 700 },
  // Result
  resultWrap: { padding: '32px', display: 'flex', flexDirection: 'column', gap: 20 },
  resultHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  resultTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: '#F8FAFC' },
  watermarkBadge: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D', fontSize: 12, padding: '3px 10px', borderRadius: 20 },
  actionRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  actionBtn: { background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '10px 20px', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  actionBtnPrimary: { background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
  suggestBox: { background: 'rgba(13,19,34,0.8)', border: '1px solid rgba(139,92,246,0.12)', borderRadius: 12, padding: '20px' },
  suggestTitle: { color: '#A78BFA', fontSize: 13, fontWeight: 500, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' },
  cutItem: { padding: '6px 0', borderBottom: '1px solid rgba(139,92,246,0.06)' },
  // Chat
  chatWrap: { background: 'rgba(13,19,34,0.8)', border: '1px solid rgba(139,92,246,0.12)', borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: 400 },
  chatTitle: { color: '#94A3B8', fontSize: 13, padding: '14px 16px', borderBottom: '1px solid rgba(139,92,246,0.1)' },
  chatMessages: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 },
  chatMsg: { padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.6, maxWidth: '85%' },
  chatMsgUser: { background: 'rgba(124,58,237,0.15)', color: '#E2E8F0', alignSelf: 'flex-end' },
  chatMsgAI: { background: 'rgba(255,255,255,0.04)', color: '#94A3B8', alignSelf: 'flex-start' },
  chatInputRow: { display: 'flex', gap: 8, padding: '12px', borderTop: '1px solid rgba(139,92,246,0.1)' },
  chatInput: { flex: 1, background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '9px 12px', color: '#E2E8F0', fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
  chatSend: { background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '8px 16px', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  // Error
  errorWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', color: '#EF4444' },
}
