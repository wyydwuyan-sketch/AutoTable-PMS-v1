import { create } from 'zustand'
import { authApi } from './api'
import type { MePayload, Tenant, UserProfile } from './types'

const ACCESS_TOKEN_KEY = 'auth_access_token'
const ACCESS_TOKEN_EXPIRES_AT_KEY = 'auth_access_token_expires_at'
const REFRESH_AHEAD_MS = 60 * 1000

interface AuthState {
  accessToken: string | null
  accessTokenExpiresAt: number | null
  user: UserProfile | null
  currentTenant: Tenant | null
  tenants: Tenant[]
  role: string | null
  roleKey: string | null
  isLoading: boolean
  initialized: boolean
  setAccessToken: (token: string | null, tenant?: Tenant | null, expiresInSeconds?: number | null) => void
  refreshAccessToken: () => Promise<string | null>
  login: (username: string, password: string) => Promise<void>
  loadMe: () => Promise<void>
  switchTenant: (tenantId: string) => Promise<void>
  logout: () => Promise<void>
  forceLogout: () => void
}

const readToken = () => {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

const readTokenExpiresAt = () => {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const writeToken = (token: string | null) => {
  if (typeof window === 'undefined') return
  if (!token) {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    return
  }
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
}

const writeTokenExpiresAt = (expiresAt: number | null) => {
  if (typeof window === 'undefined') return
  if (!expiresAt) {
    window.sessionStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY)
    return
  }
  window.sessionStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, String(expiresAt))
}

const mapMe = (payload: MePayload) => ({
  user: payload.user,
  currentTenant: payload.currentTenant,
  tenants: payload.tenants,
  role: payload.role,
  roleKey: payload.roleKey,
})

let refreshingPromise: Promise<string | null> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const clearRefreshTimer = () => {
  if (!refreshTimer) return
  clearTimeout(refreshTimer)
  refreshTimer = null
}

const scheduleRefreshTimer = (expiresAt: number, task: () => void) => {
  if (typeof window === 'undefined') return
  clearRefreshTimer()
  const delay = Math.max(1000, expiresAt - Date.now() - REFRESH_AHEAD_MS)
  refreshTimer = setTimeout(task, delay)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: readToken(),
  accessTokenExpiresAt: readTokenExpiresAt(),
  user: null,
  currentTenant: null,
  tenants: [],
  role: null,
  roleKey: null,
  isLoading: false,
  initialized: false,
  setAccessToken: (token, tenant = null, expiresInSeconds = null) => {
    const expiresAt = token && expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null
    writeToken(token)
    writeTokenExpiresAt(expiresAt)
    set({
      accessToken: token,
      accessTokenExpiresAt: expiresAt,
      currentTenant: tenant,
    })
    if (token && expiresAt) {
      scheduleRefreshTimer(expiresAt, () => {
        void get().refreshAccessToken()
      })
      return
    }
    clearRefreshTimer()
  },
  refreshAccessToken: async () => {
    const accessToken = get().accessToken
    if (!accessToken) return null
    if (refreshingPromise) {
      return refreshingPromise
    }
    refreshingPromise = (async () => {
      try {
        const payload = await authApi.refresh()
        get().setAccessToken(payload.accessToken, payload.currentTenant, payload.expiresIn)
        return payload.accessToken
      } catch {
        get().forceLogout()
        return null
      } finally {
        refreshingPromise = null
      }
    })()
    return refreshingPromise
  },
  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const tokenPayload = await authApi.login(username, password)
      get().setAccessToken(tokenPayload.accessToken, tokenPayload.currentTenant, tokenPayload.expiresIn)
      await get().loadMe()
    } finally {
      set({ isLoading: false })
    }
  },
  loadMe: async () => {
    const accessToken = get().accessToken
    if (!accessToken) {
      set({ initialized: true })
      return
    }
    const expiresAt = get().accessTokenExpiresAt
    if (expiresAt) {
      scheduleRefreshTimer(expiresAt, () => {
        void get().refreshAccessToken()
      })
    }
    set({ isLoading: true })
    try {
      const me = await authApi.me(accessToken)
      set({
        ...mapMe(me),
        initialized: true,
      })
    } catch {
      const refreshed = await get().refreshAccessToken()
      if (!refreshed) {
        get().forceLogout()
        return
      }
      try {
        const me = await authApi.me(refreshed)
        set({
          ...mapMe(me),
          initialized: true,
        })
      } catch {
        get().forceLogout()
      }
    } finally {
      set({ isLoading: false })
    }
  },
  switchTenant: async (tenantId) => {
    const accessToken = get().accessToken
    if (!accessToken) return
    set({ isLoading: true })
    try {
      const payload = await authApi.switchTenant(accessToken, tenantId)
      get().setAccessToken(payload.accessToken, payload.currentTenant, payload.expiresIn)
      await get().loadMe()
    } finally {
      set({ isLoading: false })
    }
  },
  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      get().forceLogout()
    }
  },
  forceLogout: () => {
    clearRefreshTimer()
    writeToken(null)
    writeTokenExpiresAt(null)
    set({
      accessToken: null,
      accessTokenExpiresAt: null,
      user: null,
      currentTenant: null,
      tenants: [],
      role: null,
      roleKey: null,
      initialized: true,
      isLoading: false,
    })
  },
}))
