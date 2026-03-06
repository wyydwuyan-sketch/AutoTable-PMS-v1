import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { gridApiClient } from '../features/grid/api'
import { useAuthStore } from '../features/auth/authStore'
import { getApiErrorMessage } from '../utils/apiError'
import { promptForText } from '../utils/promptForText'
import { useTableCatalog } from './hooks/useTableCatalog'

const DEFAULT_BASE_ID = 'base_1'

export function WorkspaceEntryRedirect() {
  const navigate = useNavigate()
  const { tables, isLoading, error, refreshTables } = useTableCatalog(DEFAULT_BASE_ID)
  const [emptyState, setEmptyState] = useState<'noTables' | 'noViews' | null>(null)
  const [isCreatingTable, setIsCreatingTable] = useState(false)
  const [createTableError, setCreateTableError] = useState<string | null>(null)
  const { role, roleKey } = useAuthStore(
    useShallow((state) => ({
      role: state.role,
      roleKey: state.roleKey,
    })),
  )
  const canCreateTable = role === 'owner' || roleKey === 'admin'

  useEffect(() => {
    if (isLoading) return

    setEmptyState(null)
    if (tables.length === 0) {
      setEmptyState('noTables')
      return
    }

    let active = true
    void (async () => {
      // Some older datasets never populated `defaultViewId`, so walk every table until
      // we find a view the current user can actually enter instead of assuming the first table works.
      for (const table of tables) {
        let targetViewId = table.defaultViewId ?? null
        if (!targetViewId) {
          try {
            const views = await gridApiClient.getViews(table.id)
            targetViewId = views[0]?.id ?? null
          } catch (error) {
            console.error('[WorkspaceEntryRedirect] 加载默认视图失败', error)
          }
        }
        if (!active) return
        if (targetViewId) {
          navigate(`/b/${DEFAULT_BASE_ID}/t/${table.id}/v/${targetViewId}`, { replace: true })
          return
        }
      }
      if (!active) return
      setEmptyState('noViews')
    })()

    return () => {
      active = false
    }
  }, [isLoading, navigate, tables])

  if (isLoading) {
    return <div className="grid-loading">正在加载工作区...</div>
  }
  if (error) {
    return <div className="grid-loading">{error}</div>
  }
  if (emptyState) {
    const handleCreateTable = async () => {
      if (isCreatingTable || !canCreateTable) return
      const name = await promptForText('请输入数据表名称', '', '数据表名称')
      if (!name) return
      const trimmedName = name.trim()
      if (!trimmedName) return
      setCreateTableError(null)
      setIsCreatingTable(true)
      try {
        const created = await gridApiClient.createTable(DEFAULT_BASE_ID, trimmedName)
        refreshTables()
        if (created.defaultViewId) {
          navigate(`/b/${DEFAULT_BASE_ID}/t/${created.id}/v/${created.defaultViewId}`, { replace: true })
          return
        }
        setCreateTableError('新数据表未生成默认视图。')
      } catch (createError) {
        setCreateTableError(getApiErrorMessage(createError, '创建数据表失败。'))
      } finally {
        setIsCreatingTable(false)
      }
    }
    return (
      <div className="grid-loading" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <span>
          {emptyState === 'noTables'
            ? '当前工作区暂无可访问的数据表。'
            : '当前工作区存在数据表，但你暂无可访问的视图。'}
        </span>
        {createTableError ? <span style={{ color: '#b91c1c' }}>{createTableError}</span> : null}
        {canCreateTable ? (
          <button type="button" className="cm-btn cm-btn--primary" onClick={() => void handleCreateTable()} disabled={isCreatingTable}>
            {isCreatingTable ? '创建中...' : '新增数据表'}
          </button>
        ) : null}
      </div>
    )
  }
  return <div className="grid-loading">正在进入工作区...</div>
}
