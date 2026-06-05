import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

export default function TrialBanner() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  if (!user || user.role !== 'trial' || !user.trial_end) return null

  const msLeft = new Date(user.trial_end).getTime() - Date.now()
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
  const hoursLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60)))

  if (daysLeft > 2) return null // ไม่แสดงถ้ายังเหลือเยอะ

  const isExpiring = daysLeft <= 1
  const label = daysLeft === 0
    ? hoursLeft <= 0 ? 'Your trial has expired' : `Trial expires in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`
    : `Trial expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`

  return (
    <div style={{
      background: isExpiring ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)',
      borderBottom: `1px solid ${isExpiring ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)'}`,
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>{isExpiring ? '⚠' : '⏳'}</span>
        <span style={{ color: isExpiring ? '#FCA5A5' : '#FCD34D', fontSize: 13, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ color: '#475569', fontSize: 13 }}>
          — Upgrade to remove watermark and keep full access
        </span>
      </div>
      <button
        onClick={() => navigate('/pricing')}
        style={{
          background: isExpiring ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)',
          border: `1px solid ${isExpiring ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.35)'}`,
          color: isExpiring ? '#FCA5A5' : '#FCD34D',
          padding: '6px 16px', borderRadius: 8,
          fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        Upgrade now →
      </button>
    </div>
  )
}
