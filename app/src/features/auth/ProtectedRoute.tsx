import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from './authStore'

export function ProtectedRoute() {
  const location = useLocation()
  const accessToken = useAuthStore((state) => state.accessToken)
  const initialized = useAuthStore((state) => state.initialized)
  const loadMe = useAuthStore((state) => state.loadMe)

  useEffect(() => {
    if (!initialized && accessToken) {
      void loadMe()
    }
  }, [accessToken, initialized, loadMe])

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (!initialized) {
    return <div className="grid-loading">正在加载用户信息...</div>
  }
  return <Outlet />
}
