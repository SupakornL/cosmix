import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STARS = Array.from({ length: 180 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() < 0.7 ? 1 : Math.random() < 0.9 ? 2 : 3,
  opacity: 0.2 + Math.random() * 0.7,
  duration: 2 + Math.random() * 5,
  delay: Math.random() * 5,
}))

const FEATURES = [
  {
    icon: '✂',
    title: 'Auto Cut',
    desc: 'AI detects silence, filler words, and dead air — removes them instantly',
    color: '#A78BFA',
  },
  {
    icon: '⌨',
    title: 'Auto Subtitle',
    desc: 'Whisper AI transcribes speech into accurate subtitles in 99+ languages including Thai',
    color: '#60A5FA',
  },
  {
    icon: '✦',
    title: 'Suggest Edits',
    desc: 'Claude analyzes your content and recommends the best cuts to keep viewers engaged',
    color: '#34D399',
  },
  {
    icon: '💬',
    title: 'Chat to Edit',
    desc: 'Just describe what you want — "remove the intro" or "add white subtitles" — done',
    color: '#F472B6',
  },
]

const PLANS = [
  {
    name: 'Trial',
    price: 'ฟรี',
    period: '7 วัน',
    desc: 'ทดลองใช้ฟรี ครบทุก feature',
    features: ['ทุก AI modes', 'Auto subtitle ภาษาไทย+อังกฤษ', 'ไม่จำกัด jobs ใน 7 วัน', 'มี watermark บน output'],
    cta: 'เริ่มทดลองฟรี',
    featured: false,
    plan: 'trial',
  },
  {
    name: 'Pro',
    price: '฿199',
    period: '/เดือน',
    desc: 'สำหรับ content creator จริงจัง',
    features: ['ทุก AI modes ครบ', '100 jobs/เดือน', 'ไม่มี watermark', 'Word-by-word subtitle (TikTok style)', 'Export สูงสุด 1080p'],
    cta: 'อัพเกรดเป็น Pro',
    featured: true,
    plan: 'pro',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const heroRef = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ background: '#060A12', minHeight: '100vh', color: '#E2E8F0', fontFamily: "'DM Sans', sans-serif", overflowX: 'hidden' }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@600;700;800&display=swap');

        @keyframes twinkle {
          0%, 100% { opacity: var(--min-op); }
          50% { opacity: var(--max-op); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes orbitSlow {
          from { transform: rotate(0deg) translateX(180px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(180px) rotate(-360deg); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
          70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(124,58,237,0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(124,58,237,0); }
        }
        .fade-up { animation: fadeUp 0.8s ease forwards; opacity: 0; }
        .fade-up-1 { animation-delay: 0.1s; }
        .fade-up-2 { animation-delay: 0.25s; }
        .fade-up-3 { animation-delay: 0.4s; }
        .fade-up-4 { animation-delay: 0.55s; }

        .feature-card {
          background: rgba(13,19,34,0.8);
          border: 1px solid rgba(139,92,246,0.1);
          border-radius: 16px;
          padding: 28px;
          transition: all 0.3s ease;
          cursor: default;
        }
        .feature-card:hover {
          border-color: rgba(139,92,246,0.4);
          background: rgba(20,28,50,0.9);
          transform: translateY(-4px);
        }
        .plan-card {
          background: rgba(13,19,34,0.8);
          border: 1px solid rgba(139,92,246,0.12);
          border-radius: 20px;
          padding: 32px 28px;
          transition: all 0.3s ease;
        }
        .plan-card.featured {
          background: rgba(124,58,237,0.08);
          border-color: rgba(139,92,246,0.5);
        }
        .plan-card:hover {
          transform: translateY(-4px);
        }
        .btn-primary {
          background: linear-gradient(135deg, #7C3AED, #4F46E5);
          border: none; color: #fff;
          padding: 14px 32px; border-radius: 12px;
          font-size: 15px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(148,163,184,0.25);
          color: #94A3B8;
          padding: 14px 32px; border-radius: 12px;
          font-size: 15px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-outline:hover { border-color: rgba(167,139,250,0.5); color: #A78BFA; }
        .nav-link {
          color: #64748B; font-size: 14px; text-decoration: none;
          transition: color 0.2s; cursor: pointer;
        }
        .nav-link:hover { color: #E2E8F0; }
      `}</style>

      {/* === STARS BG === */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {STARS.map(s => (
          <div key={s.id} style={{
            position: 'absolute',
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.size, height: s.size,
            borderRadius: '50%',
            background: '#fff',
            '--min-op': s.opacity * 0.2,
            '--max-op': s.opacity,
            animation: `twinkle ${s.duration}s ease-in-out infinite ${s.delay}s`,
          } as React.CSSProperties} />
        ))}
        {/* Nebula blobs */}
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(124,58,237,0.06)', filter: 'blur(100px)', top: -100, left: -100 }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(79,70,229,0.05)', filter: 'blur(100px)', top: 300, right: -80 }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(16,185,129,0.04)', filter: 'blur(80px)', bottom: 200, left: '40%' }} />
      </div>

      {/* === NAV === */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 48px', background: scrollY > 40 ? 'rgba(6,10,18,0.9)' : 'transparent', backdropFilter: scrollY > 40 ? 'blur(20px)' : 'none', borderBottom: scrollY > 40 ? '1px solid rgba(139,92,246,0.12)' : 'none', transition: 'all 0.3s' }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA, #34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ⬡ COSMIX
        </div>
        <div style={{ display: 'flex', gap: 36 }}>
          <span className="nav-link" onClick={() => document.getElementById('features')?.scrollIntoView({behavior:'smooth'})} style={{cursor:'pointer'}}>Features</span>
          <span className="nav-link" onClick={() => navigate('/pricing')} style={{cursor:'pointer'}}>Pricing</span>
          <span className="nav-link" onClick={() => document.getElementById('docs')?.scrollIntoView({behavior:'smooth'})} style={{cursor:'pointer'}}>Docs</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-outline" style={{ padding: '8px 20px', fontSize: 13 }} onClick={() => navigate('/login')}>Log in</button>
          <button className="btn-primary" style={{ padding: '8px 20px', fontSize: 13 }} onClick={() => navigate('/register')}>ทดลองฟรี 7 วัน</button>
        </div>
      </nav>

      {/* === HERO === */}
      <section ref={heroRef} style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '180px 32px 100px', transform: `translateY(${scrollY * 0.15}px)` }}>

        <div className="fade-up fade-up-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', fontSize: 12, padding: '6px 16px', borderRadius: 20, marginBottom: 28, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          ✦ AI-Powered Video Editor — Built for Creators
        </div>

        <h1 className="fade-up fade-up-2" style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(44px, 7vw, 80px)', fontWeight: 800, lineHeight: 1.05, margin: '0 0 24px', letterSpacing: '-2px' }}>
          <span style={{ background: 'linear-gradient(180deg, #F8FAFC 40%, #94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Edit videos with
          </span>
          <br />
          <span style={{ background: 'linear-gradient(135deg, #A78BFA 0%, #60A5FA 50%, #34D399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Cosmix intelligence
          </span>
        </h1>

        <p className="fade-up fade-up-3" style={{ color: '#64748B', fontSize: 18, maxWidth: 520, margin: '0 auto 44px', lineHeight: 1.75 }}>
          ให้ AI ช่วยตัดต่อ เพิ่ม subtitle อัตโนมัติ รองรับทุกภาษา<br />
          ง่ายเหมือนพิมพ์บอกว่าอยากได้อะไร
        </p>

        <div className="fade-up fade-up-4" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ fontSize: 16, padding: '15px 36px' }} onClick={() => navigate('/register')}>
            Start free trial
          </button>
          <button className="btn-outline" style={{ fontSize: 16, padding: '15px 36px' }}>
            ▶ Watch demo
          </button>
        </div>

        {/* Floating orbs */}
        <div style={{ position: 'absolute', top: 120, left: '8%', width: 60, height: 60, borderRadius: '50%', background: 'rgba(167,139,250,0.15)', animation: 'float 6s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 200, right: '10%', width: 40, height: 40, borderRadius: '50%', background: 'rgba(96,165,250,0.12)', animation: 'float 8s ease-in-out infinite 2s', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 60, left: '15%', width: 24, height: 24, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', animation: 'float 5s ease-in-out infinite 1s', pointerEvents: 'none' }} />
      </section>

      {/* === UPLOAD ZONE DEMO === */}
      <section style={{ position: 'relative', zIndex: 1, padding: '0 48px 80px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ border: '2px dashed rgba(139,92,246,0.3)', borderRadius: 20, padding: '52px 32px', textAlign: 'center', background: 'rgba(139,92,246,0.03)', cursor: 'pointer', transition: 'all 0.3s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.6)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(139,92,246,0.06)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.3)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(139,92,246,0.03)' }}
          onClick={() => navigate('/register')}
        >
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28, animation: 'pulse-ring 2.5s infinite' }}>⬆</div>
          <div style={{ color: '#CBD5E1', fontSize: 17, fontWeight: 500, marginBottom: 8 }}>Drop your video here to get started</div>
          <div style={{ color: '#475569', fontSize: 13 }}>MP4, MOV, AVI · up to 5GB · or paste a YouTube link</div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Auto Cut', 'Subtitle', 'Suggest Edits', 'Chat to Edit'].map(m => (
              <span key={m} style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', fontSize: 12, padding: '4px 12px', borderRadius: 20 }}>{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* === FEATURES === */}
      <section style={{ position: 'relative', zIndex: 1, padding: '40px 48px 100px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 16 }}>What Cosmix can do</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, margin: 0, background: 'linear-gradient(180deg, #F8FAFC 40%, #64748B 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Four ways AI edits your video
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} className="feature-card">
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `${f.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 600, color: '#E2E8F0', marginBottom: 10 }}>{f.title}</div>
              <div style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>


      {/* === HOW IT WORKS === */}
      <section id="docs" style={{ position: 'relative', zIndex: 1, padding: '40px 48px 100px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ color: '#7C3AED', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 12 }}>How it works</div>
          <h2 style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: '#E2E8F0', margin: 0 }}>ใช้งานง่าย 3 ขั้นตอน</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          {[
            { step: '01', icon: '📤', title: 'Upload วีดีโอ', desc: 'อัพโหลดวีดีโอของคุณ รองรับ MP4, MOV, AVI ขนาดสูงสุด 5GB', color: '#7C3AED' },
            { step: '02', icon: '🤖', title: 'AI ประมวลผล', desc: 'AI สร้าง subtitle อัตโนมัติ ภาษาไทย+อังกฤษ พร้อม word-by-word timing', color: '#A78BFA' },
            { step: '03', icon: '✨', title: 'Export & Share', desc: 'แก้ subtitle, เลือก style สวยๆ แล้ว export วีดีโอได้เลย', color: '#60A5FA' },
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
              <div style={{ textAlign: 'center', padding: '0 32px', maxWidth: 280 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: `${item.color}18`, borderTop: `2px solid ${item.color}40`, borderLeft: `2px solid ${item.color}40`, borderRight: `2px solid ${item.color}40`, borderBottom: `2px solid ${item.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>
                  {item.icon}
                </div>
                <div style={{ color: item.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>STEP {item.step}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#E2E8F0', marginBottom: 10, fontFamily: "'Syne', sans-serif" }}>{item.title}</div>
                <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
              {idx < 2 && (
                <div style={{ color: '#374151', fontSize: 24, paddingTop: 28, flexShrink: 0 }}>→</div>
              )}
            </div>
          ))}
        </div>
      </section>
      {/* === PRICING === */}
      <section style={{ position: 'relative', zIndex: 1, padding: '40px 48px 100px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 16 }}>Pricing</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, margin: 0, background: 'linear-gradient(180deg, #F8FAFC 40%, #64748B 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Start free, upgrade when ready
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {PLANS.map(p => (
            <div key={p.name} className={`plan-card${p.featured ? ' featured' : ''}`}>
              {p.featured && <div style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#A78BFA', fontSize: 11, padding: '3px 12px', borderRadius: 20, display: 'inline-block', marginBottom: 14, letterSpacing: '0.05em' }}>MOST POPULAR</div>}
              <div style={{ color: '#64748B', fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 40, fontWeight: 700, color: '#F8FAFC' }}>{p.price}</span>
                <span style={{ color: '#475569', fontSize: 14 }}>{p.period}</span>
              </div>
              <div style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>{p.desc}</div>
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
                {p.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: '#94A3B8', padding: '5px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ color: '#7C3AED', fontSize: 10 }}>✦</span>{f}
                  </li>
                ))}
              </ul>
              <button
                className={p.featured ? 'btn-primary' : 'btn-outline'}
                style={{ width: '100%', textAlign: 'center' }}
                onClick={() => navigate('/register')}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36, color: '#374151', fontSize: 13 }}>
          ทดลองใช้ฟรี 7 วัน · ไม่ต้องใส่บัตรเครดิต · <span style={{ color: '#A78BFA' }}>watermark จะหายเมื่ออัพเกรด</span>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(139,92,246,0.1)', padding: '40px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⬡ COSMIX</div>
        <div style={{ color: '#374151', fontSize: 13 }}>© 2026 Cosmix. Built with Claude + Groq Whisper.</div>
      </footer>
    </div>
  )
}
