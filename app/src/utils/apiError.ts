type ApiLikeError = Error & { status?: number }

const isApiLikeError = (error: unknown): error is ApiLikeError =>
  error instanceof Error && typeof (error as ApiLikeError).status !== 'undefined'

const isNetworkError = (error: unknown) => {
  if (!(error instanceof Error)) return false
  if (error instanceof TypeError) return true
  const message = error.message.toLowerCase()
  return message.includes('network') || message.includes('fetch')
}

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (isApiLikeError(error) && typeof error.status === 'number') {
    if (error.message?.trim()) {
      if (error.status >= 500) {
        return `服务器异常（${error.status}），请稍后重试。`
      }
      if (error.status === 404) {
        return error.message.includes('404') ? '请求资源不存在，请确认数据是否已被删除。' : error.message
      }
      if (error.status === 401) {
        return '登录状态已失效，请重新登录。'
      }
      if (error.status === 403) {
        return '无权限执行该操作。'
      }
      return error.message
    }
    if (error.status >= 500) return `服务器异常（${error.status}），请稍后重试。`
    if (error.status === 404) return '请求资源不存在，请确认数据是否已被删除。'
    if (error.status === 401) return '登录状态已失效，请重新登录。'
    if (error.status === 403) return '无权限执行该操作。'
    return `请求失败（${error.status}），请稍后重试。`
  }

  if (isNetworkError(error)) {
    return '网络连接失败，请检查网络后重试。'
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
