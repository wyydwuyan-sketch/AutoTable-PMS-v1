import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilterOutlined,
  MoreOutlined,
  PlusOutlined,
  SortAscendingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { ReactNode, RefObject } from 'react'
import { DropdownMenu } from '../../features/grid/components/DropdownMenu'
import { CustomSelect } from '../../features/grid/components/CustomSelect'
import type { Field, ViewConfig } from '../../features/grid/types/grid'

type ToolbarPreset = {
  id: string
  name: string
  pinned?: boolean
}

type ToolbarOverflowItem = {
  key: string
  label: ReactNode
}

interface AppShellToolbarProps {
  showGridToolbar: boolean
  canManageFilters: boolean
  canManageSorts: boolean
  canCreateRecord: boolean
  canDeleteSelectionNow: boolean
  canExportRecords: boolean
  canImportRecords: boolean
  viewConfig: ViewConfig
  onOpenFilter: () => void
  onOpenSort: () => void
  fieldDisplayRef: RefObject<HTMLDivElement | null>
  fieldDisplayOpen: boolean
  onToggleFieldDisplayOpen: () => void
  visibleFieldCount: number
  orderedFields: Field[]
  hiddenFieldSet: Set<string>
  onToggleFieldVisibility: (fieldId: string, visible: boolean) => void
  onShowAllFields: () => void
  onOpenCreateRecord: () => void
  onDeleteSelection: () => void | Promise<void>
  deleteButtonLabel: string
  toolbarCollapseToMore: boolean
  isImporting: boolean
  isExporting: boolean
  onExport: () => void | Promise<void>
  onImport: () => void | Promise<void>
  hasSelectedRecords: boolean
  isAllRecordsSelected: boolean
  pageRecordCount: number
  selectedRecordIdsCount: number
  onSelectAllRecords: () => void
  onClearSelectedRecords: () => void
  sortedPresets: ToolbarPreset[]
  selectedPresetId: string
  onApplyPreset: (presetId: string) => void
  hasFilterSummary: boolean
  hasSortSummary: boolean
  onClearFilters: () => void | Promise<void>
  toolbarOverflowMenuItems: ToolbarOverflowItem[]
  onToolbarOverflow: (key: string) => void
}

export function AppShellToolbar({
  showGridToolbar,
  canManageFilters,
  canManageSorts,
  canCreateRecord,
  canDeleteSelectionNow,
  canExportRecords,
  canImportRecords,
  viewConfig,
  onOpenFilter,
  onOpenSort,
  fieldDisplayRef,
  fieldDisplayOpen,
  onToggleFieldDisplayOpen,
  visibleFieldCount,
  orderedFields,
  hiddenFieldSet,
  onToggleFieldVisibility,
  onShowAllFields,
  onOpenCreateRecord,
  onDeleteSelection,
  deleteButtonLabel,
  toolbarCollapseToMore,
  isImporting,
  isExporting,
  onExport,
  onImport,
  hasSelectedRecords,
  isAllRecordsSelected,
  pageRecordCount,
  selectedRecordIdsCount,
  onSelectAllRecords,
  onClearSelectedRecords,
  sortedPresets,
  selectedPresetId,
  onApplyPreset,
  hasFilterSummary,
  hasSortSummary,
  onClearFilters,
  toolbarOverflowMenuItems,
  onToolbarOverflow,
}: AppShellToolbarProps) {
  if (!showGridToolbar) {
    return null
  }

  return (
    <>
      <div className="view-toolbar">
        <div className="toolbar-actions toolbar-actions-left">
          <div className="toolbar-button-group">
            {canManageFilters ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`cm-btn toolbar-state-btn ${viewConfig.filters.length > 0 ? 'is-active' : ''}`}
                  onClick={onOpenFilter}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <FilterOutlined />
                    <span>筛选</span>
                  </span>
                </button>
                {viewConfig.filters.length > 0 ? (
                  <span className="toolbar-badge">{viewConfig.filters.length}</span>
                ) : null}
              </div>
            ) : null}
            {canManageSorts ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`cm-btn toolbar-state-btn ${viewConfig.sorts.length > 0 ? 'is-active' : ''}`}
                  onClick={onOpenSort}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <SortAscendingOutlined />
                    <span>排序</span>
                  </span>
                </button>
                {viewConfig.sorts.length > 0 ? (
                  <span className="toolbar-badge">{viewConfig.sorts.length}</span>
                ) : null}
              </div>
            ) : null}
            <div ref={fieldDisplayRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button className="cm-btn" onClick={onToggleFieldDisplayOpen}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <EyeOutlined />
                  <span>字段显示</span>
                </span>
              </button>
              {fieldDisplayOpen ? (
                <div className="field-display-panel">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>字段显示</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {visibleFieldCount}/{orderedFields.length}
                    </span>
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 6 }}>
                    {orderedFields.map((field) => (
                      <label key={field.id} className="cm-checkbox-label">
                        <input
                          type="checkbox"
                          className="cm-checkbox"
                          checked={!hiddenFieldSet.has(field.id)}
                          onChange={(event) => onToggleFieldVisibility(field.id, event.target.checked)}
                        />
                        {field.name}
                      </label>
                    ))}
                  </div>
                  <button
                    className="cm-btn cm-btn--sm"
                    onClick={onShowAllFields}
                    disabled={visibleFieldCount === orderedFields.length}
                  >
                    显示全部字段
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <span className="toolbar-group-divider" aria-hidden="true" />
          <div className="toolbar-button-group">
            {canCreateRecord ? (
              <button className="cm-btn cm-btn--primary" onClick={onOpenCreateRecord}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <PlusOutlined />
                  <span>新增记录</span>
                </span>
              </button>
            ) : null}
            {canDeleteSelectionNow ? (
              <button className="cm-btn cm-btn--danger toolbar-delete-btn" onClick={() => void onDeleteSelection()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <DeleteOutlined />
                  <span>{deleteButtonLabel}</span>
                </span>
              </button>
            ) : null}
            {!toolbarCollapseToMore && canExportRecords ? (
              <button className="cm-btn" onClick={() => void onExport()} disabled={isImporting || isExporting}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <DownloadOutlined />
                  <span>{isExporting ? '导出中...' : '导出'}</span>
                </span>
              </button>
            ) : null}
            {!toolbarCollapseToMore && canImportRecords ? (
              <button className="cm-btn" onClick={() => void onImport()} disabled={isExporting || isImporting}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <UploadOutlined />
                  <span>{isImporting ? '导入中...' : '导入'}</span>
                </span>
              </button>
            ) : null}
          </div>
          {hasSelectedRecords ? (
            <div className="toolbar-selection-chip">
              <span>
                {isAllRecordsSelected
                  ? `已选择本页全部 ${pageRecordCount}/${pageRecordCount}`
                  : `已选择 ${selectedRecordIdsCount}/${pageRecordCount}`}
              </span>
              {!isAllRecordsSelected && selectedRecordIdsCount > 0 && selectedRecordIdsCount < pageRecordCount ? (
                <button className="cm-btn cm-btn--sm" onClick={onSelectAllRecords} style={{ paddingInline: 6 }}>
                  选择本页全部
                </button>
              ) : null}
              <button className="cm-btn cm-btn--sm" onClick={onClearSelectedRecords}>取消</button>
            </div>
          ) : null}
        </div>
        <div className="toolbar-actions toolbar-actions-end">
          {!toolbarCollapseToMore && canManageFilters && sortedPresets.length > 0 ? (
            <CustomSelect
              value={selectedPresetId || null}
              placeholder="选择筛选方案"
              onChange={(value) => onApplyPreset((value ?? '') as string)}
              style={{ minWidth: 190 }}
              options={sortedPresets.map((preset) => ({
                label: `${preset.pinned ? '★ ' : ''}${preset.name}`,
                value: preset.id,
              }))}
            />
          ) : null}
          {!toolbarCollapseToMore && canManageFilters && viewConfig.filters.length > 0 ? (
            <button className="cm-btn" onClick={() => void onClearFilters()}>清空筛选</button>
          ) : null}
          {toolbarOverflowMenuItems.length > 0 ? (
            <DropdownMenu items={toolbarOverflowMenuItems} onSelect={onToolbarOverflow}>
              <button className="cm-btn">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MoreOutlined />
                  <span>更多</span>
                </span>
              </button>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      {(hasFilterSummary || hasSortSummary) ? (
        <div className="toolbar-status-slot">
          <div className="filter-bar">
            <div className="filter-bar-full" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>
                {hasFilterSummary ? (
                  <>
                    <span className="tc-tag tc-tag-processing">筛选</span>{' '}
                    当前筛选：{viewConfig.filters.length} 条规则（{(viewConfig.filterLogic ?? 'and').toUpperCase()}）
                  </>
                ) : null}
                {hasSortSummary ? (
                  <>
                    <span className="tc-tag" style={{ background: '#f0e6ff', color: '#7c3aed' }}>排序</span>{' '}
                    当前排序：{viewConfig.sorts.length} 条规则
                  </>
                ) : null}
              </span>
              <button className="cm-btn cm-btn--sm" onClick={() => void onClearFilters()} disabled={!hasFilterSummary}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CloseCircleOutlined />
                  <span>一键清除</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
