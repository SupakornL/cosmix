import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

const PLANS = [
  {
    name: 'Trial',
    price: 'ฟรี',
    period: '5 วัน',
    desc: 'ทดลองใช้ฟรี ครบทุก feature',
    color: '#64748B',
    features: [
      { text: 'ทุก AI modes', ok: true },
      { text: 'Auto subtitle ภาษาไทย+อังกฤษ', ok: true },
      { text: 'ไม่จำกัด jobs ใน 5 วัน', ok: true },
      { text: 'มี watermark บน output', ok: false },
    ],
    cta: 'เริ่มทดลองฟรี',
    featured: false,
    ctaStyle: 'outline',
    plan: 'trial',
  },
  {
    name: 'Pro',
    price: '฿199',
    period: '/เดือน',
    desc: 'สำหรับ content creator จริงจัง',
    color: '#A78BFA',
    features: [
      { text: 'ทุก AI modes ครบ', ok: true },
      { text: 'Auto subtitle ภาษาไทย+อังกฤษ', ok: true },
      { text: '100 jobs/เดือน', ok: true },
      { text: 'ไม่มี watermark', ok: true },
      { text: 'Word-by-word subtitle (TikTok style)', ok: true },
      { text: 'Export สูงสุด 1080p', ok: true },
    ],
    cta: 'อัพเกรดเป็น Pro',
    featured: true,
    ctaStyle: 'primary',
    plan: 'pro',
  },
]

const FAQ = [
  { q: 'ชำระเงินผ่านช่องทางไหน?', a: 'รองรับบัตรเครดิต/เดบิต Visa, Mastercard ผ่าน Stripe ปลอดภัย 100%' },
  { q: 'ยกเลิก subscription ได้มั้ย?', a: 'ยกเลิกได้ทุกเมื่อ ไม่มีค่าปรับ ยังใช้ได้ถึงสิ้นเดือนที่จ่ายไว้' },
  { q: 'trial หมดแล้ว ข้อมูลหายมั้ย?', a: 'ไม่หายครับ account และ subtitle ที่สร้างไว้ยังอยู่ แค่ไม่สามารถสร้าง job ใหม่ได้' },
  { q: 'Subtitle รองรับภาษาไทยได้ดีมั้ย?', a: 'ใช้ Whisper large-v3 ของ Groq ซึ่ง accuracy ภาษาไทยดีมากครับ' },
]

export default function PricingPage() {
  const navigate = useNavigate()
  const { token, user } = useAuthStore()

  async function handleUpgrade() {
    if (!token) { navigate('/register'); return }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch (e) {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <div style={S.wrap}>
      <style>{CSS}</style>

      {/* Stars */}
      <div style={S.stars}>
        {STARS.map(s => (
          <div key={s.id} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, borderRadius: '50%', background: '#fff', opacity: s.op, animation: `tw ${s.dur}s ease-in-out infinite ${s.delay}s` }} />
        ))}
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(124,58,237,0.06)', filter: 'blur(100px)', top: -100, left: -100 }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(52,211,153,0.04)', filter: 'blur(80px)', top: 400, right: -80 }} />
      </div>

      {/* Nav */}
      <nav style={S.nav}>
        <div style={S.logo} onClick={() => navigate(token ? '/editor' : '/')}>⬡ COSMIX</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {token ? (
            <>
              <span style={{ color: '#64748B', fontSize: 13 }}>{user?.email}</span>
              <button style={S.btnGhost} onClick={() => navigate('/editor')}>Back to Editor</button>
            </>
          ) : (
            <>
              <button style={S.btnGhost} onClick={() => navigate('/login')}>Log in</button>
              <button style={S.btnPrimary} onClick={() => navigate('/register')}>Try free</button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.badge}>✦ Simple Pricing</div>
        <h1 style={S.heroTitle}>เลือกแพลนที่ใช่สำหรับคุณ</h1>
        <p style={S.heroSub}>ทดลองใช้ฟรี 5 วัน ไม่ต้องใส่บัตรเครดิต</p>
      </div>

      {/* Plans */}
      <div style={S.plansGrid}>
        {PLANS.map(p => (
          <div key={p.name} style={{ ...S.planCard, ...(p.featured ? S.planCardFeatured : {}) }}>
            {p.featured && <div style={S.popularBadge}>⭐ Most Popular</div>}

            <div style={{ color: p.color, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 10 }}>{p.name}</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
              <span style={S.price}>{p.price}</span>
              <span style={{ color: '#475569', fontSize: 14 }}>{p.period}</span>
            </div>
            <p style={S.planDesc}>{p.desc}</p>

            <ul style={S.featureList}>
              {p.features.map((f, i) => (
                <li key={i} style={{ ...S.featureItem, opacity: f.ok ? 1 : 0.35 }}>
                  <span style={{ color: f.ok ? p.color : '#475569', fontSize: 12, minWidth: 16 }}>
                    {f.ok ? '✓' : '✗'}
                  </span>
                  <span style={{ color: f.ok ? '#94A3B8' : '#374151', fontSize: 13 }}>{f.text}</span>
                </li>
              ))}
            </ul>

            <button
              style={p.ctaStyle === 'premium' ? S.btnPremium : p.ctaStyle === 'primary' ? S.btnPrimary : S.btnGhost}
              onClick={() => navigate('/register')}
              className="plan-btn"
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Compare table */}
      <div style={S.compareWrap}>
        <h2 style={S.compareTitle}>เปรียบเทียบแบบละเอียด</h2>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Feature</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Trial</th>
                <th style={{ ...S.th, textAlign: 'center' as const, color: '#A78BFA' }}>Pro ฿199</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Auto Cut + Subtitle', '✓', '✓'],
                ['Word-by-word subtitle', '✓', '✓'],
                ['Suggest Edits', '✓', '✓'],
                ['Chat to Edit', '✓', '✓'],
                ['Jobs', 'ไม่จำกัดใน 5 วัน', '100/เดือน'],
                ['Watermark', 'มี', 'ไม่มี'],
                ['Export quality', '1080p', '1080p'],
              ].map(([feature, trial, pro]) => (
                <tr key={feature as string} style={S.tr} className="compare-row">
                  <td style={S.td}>{feature}</td>
                  <td style={{ ...S.td, textAlign: 'center' as const, color: '#64748B' }}>{trial}</td>
                  <td style={{ ...S.td, textAlign: 'center' as const, color: pro === 'มี' ? '#374151' : '#A78BFA' }}>{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div style={S.faqWrap}>
        <h2 style={S.compareTitle}>คำถามที่พบบ่อย</h2>
        <div style={S.faqGrid}>
          {FAQ.map((f, i) => (
            <div key={i} style={S.faqCard}>
              <div style={S.faqQ}>{f.q}</div>
              <div style={S.faqA}>{f.a}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={S.ctaSection}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 700, margin: '0 0 12px', color: '#F8FAFC' }}>
          พร้อมเริ่มแล้วใช่มั้ย?
        </h2>
        <p style={{ color: '#475569', marginBottom: 28 }}>ทดลองใช้ฟรี 5 วัน ไม่ต้องใส่บัตรเครดิต</p>
        <button style={{ ...S.btnPrimary, fontSize: 16, padding: '14px 36px' }} onClick={() => navigate('/register')}>
          Start free trial
        </button>
      </div>

      {/* Footer */}
      <footer style={S.footer}>
        <div style={S.logo}>⬡ COSMIX</div>
        <div style={{ color: '#374151', fontSize: 13 }}>© 2026 Cosmix</div>
      </footer>
    </div>
  )
}

const STARS = Array.from({ length: 100 }, (_, i) => ({
  id: i, x: Math.random() * 100, y: Math.random() * 100,
  size: Math.random() < 0.8 ? 1 : 2,
  op: 0.1 + Math.random() * 0.4,
  dur: 2 + Math.random() * 4,
  delay: Math.random() * 4,
}))

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
  @keyframes tw { 0%,100%{opacity:0.1} 50%{opacity:0.6} }
  .plan-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .compare-row:hover { background: rgba(139,92,246,0.04) !important; }
  select option { background: #0D1322; }
`

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#060A12', fontFamily: "'DM Sans', sans-serif", color: '#E2E8F0', position: 'relative', overflow: 'hidden' },
  stars: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 },
  nav: { position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 48px', background: 'rgba(6,10,18,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(139,92,246,0.1)' },
  logo: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer' },
  hero: { position: 'relative', zIndex: 1, textAlign: 'center', padding: '80px 32px 48px' },
  badge: { display: 'inline-block', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', fontSize: 12, padding: '5px 16px', borderRadius: 20, marginBottom: 20, letterSpacing: '0.05em' },
  heroTitle: { fontFamily: "'Syne', sans-serif", fontSize: 'clamp(32px,5vw,52px)' as any, fontWeight: 800, margin: '0 0 12px', background: 'linear-gradient(180deg, #F8FAFC 40%, #94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  heroSub: { color: '#475569', fontSize: 16, margin: 0 },
  plansGrid: { position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 960, margin: '0 auto', padding: '0 32px 60px' },
  planCard: { background: 'rgba(13,19,34,0.85)', border: '1px solid rgba(139,92,246,0.12)', borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 0, transition: 'transform 0.2s' },
  planCardFeatured: { background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.3)' },
  popularBadge: { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', fontSize: 11, padding: '4px 12px', borderRadius: 20, display: 'inline-block', marginBottom: 14 },
  price: { fontFamily: "'Syne', sans-serif", fontSize: 40, fontWeight: 700, color: '#F8FAFC' },
  planDesc: { color: '#475569', fontSize: 13, margin: '0 0 20px' },
  featureList: { listStyle: 'none', margin: '0 0 24px', padding: 0, flex: 1 },
  featureItem: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' },
  btnPrimary: { background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s', textAlign: 'center' as const },
  btnPremium: { background: 'linear-gradient(135deg, #059669, #0D9488)', border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s', textAlign: 'center' as const },
  btnGhost: { background: 'transparent', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '11px 20px', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s', textAlign: 'center' as const },
  compareWrap: { position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto', padding: '0 32px 60px' },
  compareTitle: { fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: '#F8FAFC', textAlign: 'center', marginBottom: 28 },
  tableWrap: { background: 'rgba(13,19,34,0.85)', border: '1px solid rgba(139,92,246,0.1)', borderRadius: 16, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { color: '#475569', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '14px 20px', borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,12,20,0.5)', textAlign: 'left' as const },
  tr: { borderBottom: '1px solid rgba(139,92,246,0.06)', transition: 'background 0.15s' },
  td: { padding: '12px 20px', fontSize: 13, color: '#94A3B8' },
  faqWrap: { position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto', padding: '0 32px 60px' },
  faqGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 },
  faqCard: { background: 'rgba(13,19,34,0.8)', border: '1px solid rgba(139,92,246,0.1)', borderRadius: 12, padding: '20px' },
  faqQ: { color: '#E2E8F0', fontSize: 14, fontWeight: 500, marginBottom: 8 },
  faqA: { color: '#475569', fontSize: 13, lineHeight: 1.7 },
  ctaSection: { position: 'relative', zIndex: 1, textAlign: 'center', padding: '60px 32px 80px' },
  footer: { position: 'relative', zIndex: 1, borderTop: '1px solid rgba(139,92,246,0.1)', padding: '28px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
}
