import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleRegister() {
    setError('')
    if (!form.email || !form.password) { setError('Email and password are required'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, full_name: form.fullName }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Registration failed'); return }

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      const user = await meRes.json()
      setAuth(data.access_token, user)
      navigate('/editor')
    } catch {
      setError('Cannot connect to server')
    } finally {
      setLoading(false)
    }
  }

  const strength = form.password.length === 0 ? 0 : form.password.length < 8 ? 1 : form.password.length < 12 ? 2 : 3
  const strengthColor = ['transparent', '#EF4444', '#F59E0B', '#34D399'][strength]
  const strengthLabel = ['', 'Too short', 'Good', 'Strong'][strength]

  return (
    <div style={styles.wrap}>
      <style>{css}</style>

      <div style={styles.starsWrap}>
        {STARS.map(s => (
          <div key={s.id} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, borderRadius: '50%', background: '#fff', opacity: s.op, animation: `tw ${s.dur}s ease-in-out infinite ${s.delay}s` }} />
        ))}
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(124,58,237,0.07)', filter: 'blur(100px)', top: -100, right: -80 }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(16,185,129,0.04)', filter: 'blur(80px)', bottom: 50, left: '20%' }} />
      </div>

      <div style={styles.logo} onClick={() => navigate('/')}>⬡ COSMIX</div>

      <div style={styles.card} className="card-in">
        {/* Trial badge */}
        <div style={styles.trialBadge}>
          ✦ 5-day free trial · All features · Watermark on export
        </div>

        <h2 style={styles.title}>Create your account</h2>
        <p style={styles.subtitle}>Start editing with AI in seconds</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Full name</label>
            <input style={styles.input} className="cos-input" placeholder="Your name" value={form.fullName} onChange={set('fullName')} />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input style={styles.input} className="cos-input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input style={styles.input} className="cos-input" type="password" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} />
          {form.password.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${(strength / 3) * 100}%`, height: '100%', background: strengthColor, borderRadius: 2, transition: 'all 0.3s' }} />
              </div>
              <span style={{ fontSize: 11, color: strengthColor, minWidth: 50 }}>{strengthLabel}</span>
            </div>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Confirm password</label>
          <input style={styles.input} className="cos-input" type="password" placeholder="Repeat password" value={form.confirm} onChange={set('confirm')} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
          {form.confirm && form.password !== form.confirm && (
            <div style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>Passwords don't match</div>
          )}
        </div>

        <button style={{ ...styles.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={handleRegister} disabled={loading} className="btn-glow">
          {loading ? 'Creating account...' : 'Create account & start trial'}
        </button>

        <p style={styles.terms}>
          By signing up you agree to our <span style={{ color: '#A78BFA', cursor: 'pointer' }}>Terms</span> and <span style={{ color: '#A78BFA', cursor: 'pointer' }}>Privacy Policy</span>
        </p>

        <div style={{ borderTop: '1px solid rgba(139,92,246,0.1)', paddingTop: 20, marginTop: 4, textAlign: 'center' }}>
          <span style={{ color: '#374151', fontSize: 13 }}>Already have an account? </span>
          <Link to="/login" style={{ color: '#A78BFA', fontSize: 13, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}

const STARS = Array.from({ length: 120 }, (_, i) => ({
  id: i, x: Math.random() * 100, y: Math.random() * 100,
  size: Math.random() < 0.8 ? 1 : 2,
  op: 0.15 + Math.random() * 0.5,
  dur: 2 + Math.random() * 4,
  delay: Math.random() * 4,
}))

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
  @keyframes tw { 0%,100%{opacity:0.1} 50%{opacity:0.7} }
  @keyframes cardIn { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  .card-in { animation: cardIn 0.6s ease forwards; }
  .cos-input:focus { outline: none; border-color: rgba(139,92,246,0.6) !important; background: rgba(20,28,50,0.9) !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.12); }
  .btn-glow:hover { box-shadow: 0 0 24px rgba(124,58,237,0.4); transform: translateY(-1px); }
`

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#060A12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden', padding: '80px 16px 40px' },
  starsWrap: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 },
  logo: { position: 'fixed', top: 24, left: 48, fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer', zIndex: 10 },
  card: { position: 'relative', zIndex: 1, background: 'rgba(13,19,34,0.9)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 20, padding: '36px 36px', width: '100%', maxWidth: 440, backdropFilter: 'blur(20px)' },
  trialBadge: { background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#A78BFA', fontSize: 11, padding: '6px 14px', borderRadius: 20, textAlign: 'center', marginBottom: 24, letterSpacing: '0.04em' },
  title: { fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: '#F8FAFC', margin: '0 0 8px', textAlign: 'center' },
  subtitle: { color: '#475569', fontSize: 14, textAlign: 'center', margin: '0 0 24px' },
  errorBox: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginBottom: 18 },
  row: { display: 'flex', gap: 14 },
  field: { marginBottom: 16, flex: 1 },
  label: { display: 'block', color: '#64748B', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 },
  input: { width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '11px 14px', color: '#E2E8F0', fontSize: 15, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', transition: 'all 0.2s' },
  btnPrimary: { width: '100%', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '13px', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s', marginTop: 4 },
  terms: { color: '#374151', fontSize: 12, textAlign: 'center', margin: '14px 0 16px', lineHeight: 1.6 },
}
