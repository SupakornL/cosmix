import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  full_name?: string
  role: 'admin' | 'pay_user' | 'trial' | 'expired'
  trial_end?: string
}

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  isAuthenticated: () => boolean
  isTrial: () => boolean
  isPaid: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      isAuthenticated: () => !!get().token,
      isTrial: () => get().user?.role === 'trial',
      isPaid: () => ['pay_user', 'admin'].includes(get().user?.role ?? ''),
    }),
    { name: 'cosmix-auth' }
  )
)
