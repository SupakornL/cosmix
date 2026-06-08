import React from 'react'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

export default function TrialBanner() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  if (!user) return null

  // Expired banner
  if (user.role === 'expired') {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.08)',
        borderBottom: '1px solid rgba(239,68,68,0.3)',
        padding: '10px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔒</span>
          <span style={{ color: '#FCA5A5', fontSize: 13, fontWeight: 500 }}>Trial ของคุณหมดอายุแล้ว</span>
          <span style={{ color: '#475569', fontSize: 13 }}>— อัปเกรดเพื่อใช้งานต่อ</span>
        </div>
        <button onClick={() => navigate('/pricing')} style={expiredBtn}>Upgrade now →</button>
      </div>
    )
  }

  // Trial banner
  if (user.role !== 'trial' || !user.trial_end) return null

  const msLeft = new Date(user.trial_end).getTime() - Date.now()
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
  const hoursLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60)))

  // สีตามจำนวนวันที่เหลือ
  const isExpiring = daysLeft <= 1   // แดง
  const isWarning = daysLeft <= 3    // เหลือง
  // > 3 วัน = ฟ้าเขียว (info)

  const color = isExpiring ? '#FCA5A5' : isWarning ? '#FCD34D' : '#67E8F9'
  const bg = isExpiring ? 'rgba(239,68,68,0.08)' : isWarning ? 'rgba(245,158,11,0.08)' : 'rgba(6,182,212,0.06)'
  const border = isExpiring ? 'rgba(239,68,68,0.3)' : isWarning ? 'rgba(245,158,11,0.25)' : 'rgba(6,182,212,0.2)'
  const icon = isExpiring ? '⚠' : isWarning ? '⏳' : 'ℹ'

  const label = daysLeft === 0
    ? hoursLeft <= 0 ? 'Trial หมดอายุแล้ว' : `Trial หมดใน ${hoursLeft} ชั่วโมง`
    : `Trial เหลืออีก ${daysLeft} วัน`

  return (
    <div style={{ background: bg, borderBottom: `1px solid ${border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ color, fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#475569', fontSize: 13 }}>
          {isExpiring ? '— อัปเกรดด่วนเพื่อไม่ให้สูญเสียสิทธิ์' : '— อัปเกรดเพื่อลบ watermark และใช้งานได้ไม่จำกัด'}
        </span>
      </div>
      <button onClick={() => navigate('/pricing')} style={{ background: `rgba(${isExpiring ? '239,68,68' : isWarning ? '245,158,11' : '6,182,212'},0.15)`, border: `1px solid ${border}`, color, padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
        {isExpiring ? 'อัปเกรดเลย →' : 'ดูแพลน →'}
      </button>
    </div>
  )
}

const expiredBtn: React.CSSProperties = {
  background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
  color: '#FCA5A5', padding: '6px 16px', borderRadius: 8,
  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
