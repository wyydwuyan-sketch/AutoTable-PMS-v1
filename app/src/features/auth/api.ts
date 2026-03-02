import type { AuthTokenPayload, MePayload, TenantMember, TenantRole } from './types'
import { requestJson, requestJsonWithBearerRefresh } from '../../utils/request'

async function requestWithBearer<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  return requestJsonWithBearerRefresh<T>(path, accessToken, init)
}

const requestAuth = requestJson

export const authApi = {
  refresh() {
    return requestAuth<AuthTokenPayload>('/auth/refresh', { method: 'POST' })
  },
  login(username: string, password: string) {
    return requestAuth<AuthTokenPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },
  logout() {
    return requestAuth<{ detail: string }>('/auth/logout', { method: 'POST' })
  },
  me(accessToken: string) {
    return requestWithBearer<MePayload>('/auth/me', accessToken)
  },
  switchTenant(accessToken: string, tenantId: string) {
    return requestWithBearer<AuthTokenPayload>('/tenants/switch', accessToken, {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    })
  },
  listMembers(accessToken: string) {
    return requestWithBearer<TenantMember[]>('/tenants/current/members', accessToken)
  },
  removeMember(accessToken: string, userId: string) {
    return requestWithBearer<{ detail: string }>(`/tenants/current/members/${userId}`, accessToken, {
      method: 'DELETE',
    })
  },
  createMember(
    accessToken: string,
    payload: { username: string; account: string; email?: string; mobile?: string; roleKey?: string; password?: string },
  ) {
    return requestWithBearer<TenantMember>('/tenants/current/members', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  firstLoginChangePassword(account: string, password: string, newPassword: string) {
    return requestAuth<{ detail: string }>('/auth/first-login/change-password', {
      method: 'POST',
      body: JSON.stringify({ account, password, newPassword }),
    })
  },
  updateMemberRole(accessToken: string, userId: string, roleKey: string) {
    return requestWithBearer<TenantMember>(`/tenants/current/members/${userId}/role`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ roleKey }),
    })
  },
  listRoles(accessToken: string) {
    return requestWithBearer<TenantRole[]>('/tenants/current/roles', accessToken)
  },
  createRole(accessToken: string, payload: Omit<TenantRole, 'key'> & { key: string }) {
    return requestWithBearer<TenantRole>('/tenants/current/roles', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateRole(accessToken: string, roleKey: string, payload: Partial<Omit<TenantRole, 'key'>>) {
    return requestWithBearer<TenantRole>(`/tenants/current/roles/${roleKey}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  deleteRole(accessToken: string, roleKey: string) {
    return requestWithBearer<{ detail: string }>(`/tenants/current/roles/${roleKey}`, accessToken, {
      method: 'DELETE',
    })
  },
}
