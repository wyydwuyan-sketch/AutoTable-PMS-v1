import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from './authStore'
import { authApi } from './api'
import { CustomModal } from '../grid/components/CustomModal'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const isLoading = useAuthStore((state) => state.isLoading)
  const [error, setError] = useState('')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [remember, setRemember] = useState(true)

  // first login change-password modal
  const [firstLoginOpen, setFirstLoginOpen] = useState(false)
  const [firstLoginLoading, setFirstLoginLoading] = useState(false)
  const [flAccount, setFlAccount] = useState('')
  const [flPassword, setFlPassword] = useState('')
  const [flNewPassword, setFlNewPassword] = useState('')
  const [flConfirmPassword, setFlConfirmPassword] = useState('')
  const [flError, setFlError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setError('')
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败'
      if (message.includes('首次登录请先修改密码')) {
        setFlAccount(username)
        setFlPassword(password)
        setFlNewPassword('')
        setFlConfirmPassword('')
        setFlError('')
        setFirstLoginOpen(true)
        return
      }
      setError(message)
    }
  }

  const handleFirstLoginOk = async () => {
    setFlError('')
    if (!flNewPassword || flNewPassword.length < 8) {
      setFlError('新密码至少 8 位')
      return
    }
    if (flNewPassword !== flConfirmPassword) {
      setFlError('两次输入的新密码不一致')
      return
    }
    setFirstLoginLoading(true)
    try {
      await authApi.firstLoginChangePassword(flAccount, flPassword, flNewPassword)
      setFirstLoginOpen(false)
      await login(flAccount, flNewPassword)
      navigate('/', { replace: true })
    } catch (err) {
      setFlError(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setFirstLoginLoading(false)
    }
  }

  return (
    <div className="login-page-shell">
      <div className="login-bg-orb login-bg-orb-a" aria-hidden="true" />
      <div className="login-bg-orb login-bg-orb-b" aria-hidden="true" />
      <div className="login-grid-bg" aria-hidden="true" />

      <div className="login-page-center">
        <div className="login-card" style={{ width: 420 }}>
          <div className="login-brand">
            <div className="login-brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <div className="login-brand-title">AtuoTable</div>
              <div className="login-brand-subtitle">协作数据平台</div>
            </div>
          </div>

          <h4 style={{ marginTop: 6, marginBottom: 4, fontSize: 18, fontWeight: 600 }}>
            登录
          </h4>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            测试环境默认账号：admin / admin123
          </p>
          {error ? (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠</span> {error}
            </div>
          ) : null}
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">账号</label>
              <input className="cm-input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">密码</label>
              <input className="cm-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="login-form-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" className="cm-checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                记住密码
              </label>
              <button
                type="button"
                className="login-link-btn"
                onClick={(event) => {
                  event.preventDefault()
                }}
                style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 13 }}
              >
                忘记密码
              </button>
            </div>
            <button type="submit" className="cm-btn cm-btn--primary" style={{ width: '100%' }} disabled={isLoading}>
              {isLoading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
        <div className="login-footer">
          © {new Date().getFullYear()} AtuoTable · Internal Preview
        </div>
      </div>

      <CustomModal
        open={firstLoginOpen}
        title="首次登录请修改密码"
        onCancel={() => setFirstLoginOpen(false)}
        okText="确认修改"
        cancelText="取消"
        confirmLoading={firstLoginLoading}
        onOk={() => void handleFirstLoginOk()}
      >
        {flError ? (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 8 }}>
            {flError}
          </div>
        ) : null}
        <div className="form-group">
          <label className="form-label">账号</label>
          <input className="cm-input" value={flAccount} onChange={(e) => setFlAccount(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">原密码</label>
          <input className="cm-input" type="password" value={flPassword} onChange={(e) => setFlPassword(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">新密码</label>
          <input className="cm-input" type="password" value={flNewPassword} onChange={(e) => setFlNewPassword(e.target.value)} required />
          {flNewPassword.length > 0 && flNewPassword.length < 8 ? <span style={{ fontSize: 12, color: '#dc2626' }}>至少 8 位</span> : null}
        </div>
        <div className="form-group">
          <label className="form-label">确认新密码</label>
          <input className="cm-input" type="password" value={flConfirmPassword} onChange={(e) => setFlConfirmPassword(e.target.value)} required />
          {flConfirmPassword.length > 0 && flNewPassword !== flConfirmPassword ? <span style={{ fontSize: 12, color: '#dc2626' }}>两次输入的新密码不一致</span> : null}
        </div>
      </CustomModal>
    </div>
  )
}
