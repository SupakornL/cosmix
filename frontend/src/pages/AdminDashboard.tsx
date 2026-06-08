import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

// ─── Types ───────────────────────────────────────────────────
interface UserRow {
  id: string; email: string; full_name?: string; role: string
  is_active: boolean; trial_end?: string; days_left?: number
  total_jobs: string; total_paid: string; extra_days: string; created_at: string
}
interface Overview {
  users: { total: number; trial: number; pay: number; free: number; expired: number }
  jobs: { total: number; processing: number; failed: number }
}

// ─── Helpers ─────────────────────────────────────────────────
const TOKEN = () => useAuthStore.getState().token || ''
const api = (path: string, opts?: RequestInit) =>
  fetch(`${import.meta.env.VITE_API_URL || ''}/api${path}`, { ...opts, headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json', ...(opts?.headers || {}) } })

const ROLE_COLORS: Record<string, string> = {
  admin: '#34D399', pay_user: '#A78BFA', free_user: '#60A5FA',
  trial: '#F59E0B', expired: '#EF4444',
}
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', pay_user: 'Pro', free_user: 'Free', trial: 'Trial', expired: 'Expired',
}

// ─── Main Component ──────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)

  const [tab, setTab] = useState<'overview' | 'users' | 'jobs'>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  // Add Free User modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', full_name: '', password: '' })

  // Extra days modal
  const [extraTarget, setExtraTarget] = useState<UserRow | null>(null)
  const [extraDays, setExtraDays] = useState(3)

  useEffect(() => { if (user?.role !== 'admin') navigate('/login') }, [user])
  useEffect(() => { fetchOverview() }, [])
  useEffect(() => { if (tab === 'users') fetchUsers(); else if (tab === 'jobs') fetchJobs() }, [tab, roleFilter])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function fetchOverview() {
    const res = await api('/admin/overview')
    if (res.ok) setOverview(await res.json())
  }
  async function fetchUsers() {
    setLoading(true)
    const q = roleFilter ? `?role=${roleFilter}` : ''
    const res = await api(`/admin/users${q}`)
    if (res.ok) { const d = await res.json(); setUsers(d.users) }
    setLoading(false)
  }
  async function fetchJobs() {
    setLoading(true)
    const res = await api('/admin/jobs')
    if (res.ok) { const d = await res.json(); setJobs(d.jobs) }
    setLoading(false)
  }
  async function handleAddFreeUser() {
    const res = await api('/admin/users/add-free', { method: 'POST', body: JSON.stringify(addForm) })
    if (res.ok) { showToast('✓ Free user added'); setShowAddModal(false); setAddForm({ email: '', full_name: '', password: '' }); fetchUsers() }
    else { const e = await res.json(); showToast('✗ ' + e.detail) }
  }
  async function handleRoleChange(userId: string, role: string) {
    const res = await api(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    if (res.ok) { showToast('✓ Role updated'); fetchUsers() }
  }
  async function handleBan(userId: string, active: boolean) {
    const res = await api(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) })
    if (res.ok) { showToast(active ? '✓ User activated' : '✓ User banned'); fetchUsers() }
  }
  async function handleExtraDays() {
    if (!extraTarget) return
    const res = await api(`/admin/users/${extraTarget.id}`, { method: 'PATCH', body: JSON.stringify({ extra_days: extraDays }) })
    if (res.ok) { showToast(`✓ +${extraDays} days added`); setExtraTarget(null); fetchUsers() }
  }

  return (
    <div style={S.wrap}>
      <style>{CSS}</style>

      {/* Toast */}
      {toast && <div style={S.toast}>{toast}</div>}

      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={{ ...S.sidebarLogo, cursor: 'pointer' }} onClick={() => navigate('/editor')}>⬡ COSMIX</div>
        <div style={S.sidebarLabel}>ADMIN PANEL</div>
        {(['overview', 'users', 'jobs'] as const).map(t => (
          <button key={t} style={{ ...S.sidebarBtn, ...(tab === t ? S.sidebarBtnActive : {}) }} onClick={() => setTab(t)}>
            {t === 'overview' ? '◈ Overview' : t === 'users' ? '◉ Users' : '▸ Jobs'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={S.sidebarUser}>{user?.email}</div>
        <button style={S.sidebarLogout} onClick={() => { logout(); navigate('/login') }}>Sign out</button>
      </aside>

      {/* Main */}
      <main style={S.main}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && overview && (
          <div>
            <h1 style={S.pageTitle}>Overview</h1>
            <div style={S.statGrid}>
              {[
                { label: 'Total Users', value: overview.users.total, color: '#A78BFA' },
                { label: 'Trial', value: overview.users.trial, color: '#F59E0B' },
                { label: 'Pro Users', value: overview.users.pay, color: '#34D399' },
                { label: 'Free Users', value: overview.users.free, color: '#60A5FA' },
                { label: 'Expired', value: overview.users.expired, color: '#EF4444' },
                { label: 'Total Jobs', value: overview.jobs.total, color: '#A78BFA' },
                { label: 'Processing', value: overview.jobs.processing, color: '#F59E0B' },
                { label: 'Failed Jobs', value: overview.jobs.failed, color: '#EF4444' },
              ].map(s => (
                <div key={s.label} style={S.statCard}>
                  <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
                  <div style={S.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <h2 style={S.sectionTitle}>Quick Actions</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button style={S.actionBtn} onClick={() => { setTab('users'); setShowAddModal(true) }}>+ Add Free User</button>
              <button style={S.actionBtn} onClick={() => setTab('users')}>Manage Users</button>
              <button style={S.actionBtn} onClick={() => setTab('jobs')}>Monitor Jobs</button>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <h1 style={{ ...S.pageTitle, margin: 0 }}>Users</h1>
              <div style={{ display: 'flex', gap: 10 }}>
                <select style={S.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                  <option value="">All roles</option>
                  <option value="trial">Trial</option>
                  <option value="pay_user">Pro</option>
                  <option value="free_user">Free</option>
                  <option value="expired">Expired</option>
                  <option value="admin">Admin</option>
                </select>
                <button style={S.btnPrimary} onClick={() => setShowAddModal(true)}>+ Add Free User</button>
              </div>
            </div>

            {loading ? <div style={S.loading}>Loading...</div> : (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['User', 'Role', 'Status', 'Joined', 'Jobs', 'Days Left', 'Extra Days', 'Actions'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={S.tr} className="admin-row">
                        <td style={S.td}>
                          <div style={{ fontWeight: 500, color: '#E2E8F0', fontSize: 13 }}>{u.full_name || '—'}</div>
                          <div style={{ color: '#475569', fontSize: 12 }}>{u.email}</div>
                        </td>
                        <td style={S.td}>
                          <select style={{ ...S.rolePill, background: `${ROLE_COLORS[u.role]}20`, color: ROLE_COLORS[u.role], border: `1px solid ${ROLE_COLORS[u.role]}40` }}
                            value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}>
                            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td style={S.td}>
                          <span style={{ color: u.is_active ? '#34D399' : '#EF4444', fontSize: 12 }}>
                            {u.is_active ? '● Active' : '● Banned'}
                          </span>
                        </td>
                        <td style={S.td}>
                          <span style={{ color: '#475569', fontSize: 12 }}>
                            {new Date(u.created_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' as const }}>
                          {u.role === 'trial' && u.days_left !== undefined ? (
                            <span style={{ color: u.days_left <= 1 ? '#EF4444' : u.days_left <= 3 ? '#F59E0B' : '#34D399', fontSize: 13, fontWeight: 500 }}>
                              {u.days_left === 0 ? 'หมดวันนี้' : `${u.days_left}d`}
                            </span>
                          ) : (
                            <span style={{ color: '#374151', fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ ...S.td, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>{u.total_jobs}</td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          {u.role === 'trial' ? (
                            <button style={S.extraBtn} onClick={() => { setExtraTarget(u); setExtraDays(3) }}>
                              +days
                            </button>
                          ) : <span style={{ color: '#374151', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={S.td}>
                          <button style={S.dangerBtn} onClick={() => handleBan(u.id, !u.is_active)}>
                            {u.is_active ? 'Ban' : 'Unban'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <div style={S.empty}>No users found</div>}
              </div>
            )}
          </div>
        )}

        {/* ── JOBS ── */}
        {tab === 'jobs' && (
          <div>
            <h1 style={S.pageTitle}>Job Monitor</h1>
            {loading ? <div style={S.loading}>Loading...</div> : (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['File', 'Mode', 'Status', 'Progress', 'Watermark', 'Created'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.id} style={S.tr} className="admin-row">
                        <td style={S.td}>
                          <div style={{ color: '#E2E8F0', fontSize: 13 }}>{j.filename}</div>
                          <div style={{ color: '#374151', fontSize: 11 }}>{j.id.slice(0, 8)}...</div>
                        </td>
                        <td style={{ ...S.td, color: '#A78BFA', fontSize: 12 }}>{j.ai_mode}</td>
                        <td style={S.td}>
                          <span style={{ color: { done: '#34D399', processing: '#F59E0B', failed: '#EF4444', pending: '#64748B' }[j.status as string] || '#64748B', fontSize: 13 }}>
                            ● {j.status}
                          </span>
                          {j.error && <div style={{ color: '#EF4444', fontSize: 11, marginTop: 2 }}>{j.error.slice(0, 40)}</div>}
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ width: `${j.progress}%`, height: '100%', borderRadius: 2, background: '#7C3AED' }} />
                            </div>
                            <span style={{ color: '#64748B', fontSize: 12 }}>{j.progress}%</span>
                          </div>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center', fontSize: 13, color: j.has_watermark ? '#F59E0B' : '#34D399' }}>
                          {j.has_watermark ? '✦' : '✓'}
                        </td>
                        <td style={{ ...S.td, color: '#475569', fontSize: 12 }}>
                          {new Date(j.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {jobs.length === 0 && <div style={S.empty}>No jobs yet</div>}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── ADD FREE USER MODAL ── */}
      {showAddModal && (
        <div style={S.modalBg} onClick={() => setShowAddModal(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>Add Free User</h3>
            <p style={{ color: '#475569', fontSize: 13, marginBottom: 20 }}>This user gets full access with no watermark and no expiry.</p>
            {['email', 'full_name', 'password'].map(k => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={S.label}>{k.replace('_', ' ').toUpperCase()}</label>
                <input style={S.input} type={k === 'password' ? 'password' : 'text'}
                  value={(addForm as any)[k]}
                  onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))}
                  className="cos-input" />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button style={S.btnPrimary} onClick={handleAddFreeUser}>Add User</button>
              <button style={S.btnCancel} onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EXTRA DAYS MODAL ── */}
      {extraTarget && (
        <div style={S.modalBg} onClick={() => setExtraTarget(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>Grant Extra Days</h3>
            <p style={{ color: '#94A3B8', fontSize: 14, marginBottom: 20 }}>{extraTarget.email}</p>
            <label style={S.label}>DAYS TO ADD</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '12px 0 24px' }}>
              {[1, 3, 7, 14, 30].map(d => (
                <button key={d} style={{ ...S.dayChip, ...(extraDays === d ? S.dayChipActive : {}) }} onClick={() => setExtraDays(d)}>
                  +{d}d
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={S.btnPrimary} onClick={handleExtraDays}>Confirm +{extraDays} days</button>
              <button style={S.btnCancel} onClick={() => setExtraTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; }
  .admin-row:hover { background: rgba(139,92,246,0.04) !important; }
  .cos-input:focus { outline: none; border-color: rgba(139,92,246,0.6) !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.12); }
  @keyframes toastIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  select option { background: #0D1322; color: #E2E8F0; }
`

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', minHeight: '100vh', background: '#060A12', fontFamily: "'DM Sans', sans-serif", color: '#E2E8F0' },
  // Sidebar
  sidebar: { width: 220, background: 'rgba(13,19,34,0.95)', borderRight: '1px solid rgba(139,92,246,0.1)', display: 'flex', flexDirection: 'column', padding: '24px 16px', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 20 },
  sidebarLogo: { fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg, #A78BFA, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8 },
  sidebarLabel: { color: '#374151', fontSize: 10, letterSpacing: '0.1em', marginBottom: 20, paddingLeft: 4 },
  sidebarBtn: { background: 'transparent', border: 'none', color: '#64748B', padding: '10px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', textAlign: 'left', width: '100%', marginBottom: 4, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' },
  sidebarBtnActive: { background: 'rgba(139,92,246,0.12)', color: '#A78BFA' },
  sidebarUser: { color: '#374151', fontSize: 12, padding: '8px 12px', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sidebarLogout: { background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif' " },
  // Main
  main: { marginLeft: 220, flex: 1, padding: '40px 40px', minHeight: '100vh' },
  pageTitle: { fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700, color: '#F8FAFC', marginBottom: 28, marginTop: 0 },
  sectionTitle: { fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 600, color: '#94A3B8', marginTop: 36, marginBottom: 16 },
  // Stats
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 },
  statCard: { background: 'rgba(13,19,34,0.8)', border: '1px solid rgba(139,92,246,0.1)', borderRadius: 14, padding: '20px 18px' },
  statValue: { fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 700, marginBottom: 4 },
  statLabel: { color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' },
  // Table
  tableWrap: { background: 'rgba(13,19,34,0.8)', border: '1px solid rgba(139,92,246,0.1)', borderRadius: 14, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 16px', borderBottom: '1px solid rgba(139,92,246,0.1)', textAlign: 'left', background: 'rgba(8,12,20,0.5)' },
  tr: { borderBottom: '1px solid rgba(139,92,246,0.06)', transition: 'background 0.15s' },
  td: { padding: '12px 16px', verticalAlign: 'middle' },
  empty: { textAlign: 'center', color: '#374151', padding: '40px', fontSize: 14 },
  loading: { color: '#475569', padding: '40px', textAlign: 'center' },
  // Buttons
  btnPrimary: { background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
  btnCancel: { background: 'transparent', border: '1px solid rgba(139,92,246,0.25)', color: '#94A3B8', padding: '9px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  actionBtn: { background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#A78BFA', padding: '10px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  extraBtn: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  dangerBtn: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  // Role pill (select)
  rolePill: { borderRadius: 20, padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
  // Select filter
  select: { background: 'rgba(13,19,34,0.9)', border: '1px solid rgba(139,92,246,0.2)', color: '#94A3B8', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' },
  // Modal
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#0D1322', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 400 },
  modalTitle: { fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px' },
  label: { display: 'block', color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 },
  input: { width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '10px 12px', color: '#E2E8F0', fontSize: 14, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' },
  // Day chips
  dayChip: { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#64748B', padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' },
  dayChipActive: { background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.5)', color: '#A78BFA' },
  // Toast
  toast: { position: 'fixed', bottom: 28, right: 28, background: 'rgba(13,19,34,0.95)', border: '1px solid rgba(139,92,246,0.3)', color: '#E2E8F0', padding: '12px 20px', borderRadius: 10, fontSize: 14, zIndex: 200, animation: 'toastIn 0.3s ease' },
}
