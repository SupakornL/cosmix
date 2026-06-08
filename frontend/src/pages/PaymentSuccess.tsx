import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const { token, setAuth, user } = useAuthStore()

  useEffect(() => {
    // Refresh user info after payment
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(u => {
          if (u.id) setAuth(token, u)
          setTimeout(() => navigate('/editor'), 3000)
        })
    }
  }, [token])

  return (
    <div style={{
      minHeight: '100vh', background: '#060A12', display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif", color: '#E2E8F0', gap: 20
    }}>
      <div style={{ fontSize: 64 }}>🎉</div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800,
        background: 'linear-gradient(135deg,#A78BFA,#60A5FA)', WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent', margin: 0 }}>
        ยินดีต้อนรับสู่ Cosmix Pro!
      </h1>
      <p style={{ color: '#64748B', fontSize: 16 }}>กำลังพาคุณไปยัง Editor...</p>
    </div>
  )
}
