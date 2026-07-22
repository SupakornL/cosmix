import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import React from 'react'
import { useAuthStore } from './store/auth'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import EditorPage from './pages/EditorPage'
import DashboardPage from './pages/DashboardPage'
import AdminDashboard from './pages/AdminDashboard'
import PricingPage from './pages/PricingPage'
import VideoEditor from './pages/VideoEditor'
import PaymentSuccess from './pages/PaymentSuccess'

function ExpiredGateway() {
  const navigate = useNavigate()
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  return (
    <div style={{ minHeight: '100vh', background: '#060A12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: '32px 16px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 48, cursor: 'pointer' }} onClick={() => navigate('/')}>⬡ COSMIX</div>
      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 24, padding: '48px 40px', maxWidth: 440, width: '100%' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: '#F8FAFC', margin: '0 0 12px' }}>Trial หมดอายุแล้ว</h2>
        <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, margin: '0 0 8px' }}>{user?.email}</p>
        <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.7, margin: '0 0 32px' }}>
          Trial 7 วันของคุณหมดแล้ว — account และ subtitle ที่สร้างไว้ยังอยู่ครบ<br />
          อัปเกรดเป็น Pro เพื่อใช้งานต่อ
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '13px', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => navigate('/pricing')}>
            อัพเกรด Pro — ฿199/เดือน
          </button>
          <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#475569', padding: '11px', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { logout(); navigate('/login') }}>
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const user = useAuthStore(s => s.user)
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  if (user?.role === 'expired') return <ExpiredGateway />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/editor" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/editor" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
      <Route path="/editor/:jobId" element={<ProtectedRoute><VideoEditor /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
    </Routes>
  )
}
