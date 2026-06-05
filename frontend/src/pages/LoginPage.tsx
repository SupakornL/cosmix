import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      const form = new FormData()
      form.append('username', email)
      form.append('password', password)

      const res = await fetch('/api/auth/login', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Login failed')
        return
      }

      // Fetch user info
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      const user = await meRes.json()
      setAuth(data.access_token, user)

      if (user.role === 'admin') navigate('/admin')
      else navigate('/editor')

    } catch {
      setError('Cannot connect to server')
    } finally {
      setLoading(false)
    }
  }

  // Trial days remaining
  const trialDaysLeft = (trialEnd: string) => {
    const diff = new Date(trialEnd).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  return (
    <div style={styles.wrap}>
      <style>{css}</style>

      {/* Stars */}
      <div style={styles.starsWrap}>
        {STARS.map(s => (
          <div key={s.id} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, borderRadius: '50%', background: '#fff', opacity: s.op, animation: `tw ${s.dur}s ease-in-out infinite ${s.delay}s` }} />
        ))}
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(124,58,237,0.07)', filter: 'blur(100px)', top: -100, left: -80, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(79,70,229,0.05)', filter: 'blur(80px)', bottom: 0, right: -60, pointerEvents: 'none' }} />
      </div>

      {/* Logo */}
      <div style={styles.logo} onClick={() => navigate('/')}>⬡ COSMIX</div>

      {/* Card */}
      <div style={styles.card} className="card-in">
        <h2 style={styles.title}>Welcome back</h2>
        <p style={styles.subtitle}>Sign in to your Cosmix account</p>

        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="cos-input"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="cos-input"
          />
        </div>

        <button
          style={{ ...styles.btnPrimary, opacity: loading ? 0.7 : 1 }}
          onClick={handleLogin}
          disabled={loading}
          className="btn-glow"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerText}>Don't have an account?</span>
        </div>

        <Link to="/register" style={styles.btnOutline}>
          Create account — free 5-day trial
        </Link>
      </div>

      {/* Trial notice */}
      <p style={styles.note}>
        Trial accounts include all features with watermark for 5 days
      </p>
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
  wrap: { minHeight: '100vh', background: '#060A12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden', padding: '24px 16px' },
  starsWrap: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 },
  logo: { position: 'fixed', top: 24, left: 48, fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer', zIndex: 10 },
  card: { position: 'relative', zIndex: 1, background: 'rgba(13,19,34,0.9)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 420, backdropFilter: 'blur(20px)' },
  title: { fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: '#F8FAFC', margin: '0 0 8px', textAlign: 'center' },
  subtitle: { color: '#475569', fontSize: 14, textAlign: 'center', margin: '0 0 28px' },
  errorBox: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginBottom: 20 },
  field: { marginBottom: 18 },
  label: { display: 'block', color: '#64748B', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  input: { width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '12px 14px', color: '#E2E8F0', fontSize: 15, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', transition: 'all 0.2s' },
  btnPrimary: { width: '100%', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '13px', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s', marginTop: 4 },
  divider: { textAlign: 'center', margin: '20px 0 16px' },
  dividerText: { color: '#374151', fontSize: 13 },
  btnOutline: { display: 'block', textAlign: 'center', background: 'transparent', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '12px', borderRadius: 12, fontSize: 14, textDecoration: 'none', transition: 'all 0.2s' },
  note: { position: 'relative', zIndex: 1, color: '#374151', fontSize: 12, marginTop: 20, textAlign: 'center' },
}
