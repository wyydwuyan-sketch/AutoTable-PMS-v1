import { useAuthStore } from '../features/auth/authStore'

export type RequestError = Error & { status?: number }

const DEFAULT_API_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : 'http://127.0.0.1:8000'

const API_BASE_URL = import.meta.env.VITE_GRID_API_BASE_URL ?? DEFAULT_API_BASE_URL

function mergeHeaders(initHeaders?: HeadersInit, extraHeaders?: HeadersInit) {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value))
  }
  if (initHeaders) {
    new Headers(initHeaders).forEach((value, key) => headers.set(key, value))
  }
  return headers
}

async function requestJsonCore<T>(path: string, init?: RequestInit, extraHeaders?: HeadersInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: mergeHeaders(init?.headers, extraHeaders),
  })

  if (!response.ok) {
    let detail = `请求失败 (${response.status})`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body?.detail) {
        detail = body.detail
      }
    } catch {
      // keep fallback detail
    }
    const error = new Error(detail) as RequestError
    error.status = response.status
    throw error
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJsonCore<T>(path, init)
}

export async function requestJsonWithAuthStore<T>(path: string, init?: RequestInit, allowRetry = true): Promise<T> {
  const token = useAuthStore.getState().accessToken
  try {
    return await requestJsonCore<T>(path, init, token ? { Authorization: `Bearer ${token}` } : undefined)
  } catch (error) {
    if ((error as RequestError)?.status !== 401) {
      throw error
    }

    if (allowRetry) {
      const refreshed = await useAuthStore.getState().refreshAccessToken()
      if (refreshed) {
        return requestJsonWithAuthStore<T>(path, init, false)
      }
    }

    useAuthStore.getState().forceLogout()
    const authError = new Error('登录状态已失效，请重新登录。') as RequestError
    authError.status = 401
    throw authError
  }
}

export async function requestJsonWithBearerRefresh<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  try {
    return await requestJsonCore<T>(path, init, { Authorization: `Bearer ${accessToken}` })
  } catch (error) {
    const status = (error as RequestError)?.status
    if (status !== 401) {
      throw error
    }
    const refreshed = await useAuthStore.getState().refreshAccessToken()
    if (!refreshed) {
      throw error
    }
    return requestJsonCore<T>(path, init, { Authorization: `Bearer ${refreshed}` })
  }
}
