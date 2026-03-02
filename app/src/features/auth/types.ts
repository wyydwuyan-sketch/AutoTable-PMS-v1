export interface Tenant {
  id: string
  name: string
}

export interface UserProfile {
  id: string
  username: string
  account?: string
  email?: string | null
  mobile?: string | null
  defaultTenantId: string | null
}

export interface AuthTokenPayload {
  accessToken: string
  tokenType: 'bearer'
  expiresIn: number
  currentTenant: Tenant
  requiresPasswordChange?: boolean
}

export interface MePayload {
  user: UserProfile
  currentTenant: Tenant
  role: string
  roleKey: string
  tenants: Tenant[]
}

export interface TenantMember {
  userId: string
  username: string
  role: string
  roleKey: string
  roleName: string
  temporaryPassword?: string | null
}

export interface TenantRole {
  key: string
  name: string
  canManageMembers: boolean
  canManagePermissions: boolean
  defaultTableCanRead: boolean
  defaultTableCanWrite: boolean
}
