import {
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  FilterOutlined,
  MoreOutlined,
  SortAscendingOutlined,
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
  canDeleteSelectionNow,
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
  onDeleteSelection,
  deleteButtonLabel,
  toolbarCollapseToMore,
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
      {/* Inline toolbar buttons — rendered inside the tab bar row */}
      <div className="toolbar-inline-buttons">
        {canManageFilters ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className={`toolbar-inline-btn ${viewConfig.filters.length > 0 ? 'is-active' : ''}`}
              onClick={onOpenFilter}
            >
              <FilterOutlined />
              <span>筛选</span>
            </button>
            {viewConfig.filters.length > 0 ? (
              <span className="toolbar-badge">{viewConfig.filters.length}</span>
            ) : null}
          </div>
        ) : null}
        {canManageSorts ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className={`toolbar-inline-btn ${viewConfig.sorts.length > 0 ? 'is-active' : ''}`}
              onClick={onOpenSort}
            >
              <SortAscendingOutlined />
              <span>排序</span>
            </button>
            {viewConfig.sorts.length > 0 ? (
              <span className="toolbar-badge">{viewConfig.sorts.length}</span>
            ) : null}
          </div>
        ) : null}
        <div ref={fieldDisplayRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button className="toolbar-inline-btn" onClick={onToggleFieldDisplayOpen}>
            <EyeOutlined />
            <span>字段显示</span>
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
        {!toolbarCollapseToMore && canManageFilters && sortedPresets.length > 0 ? (
          <>
            <div className="toolbar-inline-divider" />
            <CustomSelect
              value={selectedPresetId || null}
              placeholder="选择筛选方案"
              onChange={(value) => onApplyPreset((value ?? '') as string)}
              style={{ minWidth: 160 }}
              options={sortedPresets.map((preset) => ({
                label: `${preset.pinned ? '★ ' : ''}${preset.name}`,
                value: preset.id,
              }))}
            />
          </>
        ) : null}
        {toolbarOverflowMenuItems.length > 0 ? (
          <DropdownMenu items={toolbarOverflowMenuItems} onSelect={onToolbarOverflow}>
            <button className="toolbar-inline-btn">
              <MoreOutlined />
            </button>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Filter/sort status bar — rendered below the tab bar */}
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
              <button
                className="cm-btn cm-btn--sm"
                onClick={() => void onClearFilters()}
                disabled={!(hasFilterSummary || hasSortSummary)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CloseCircleOutlined />
                  <span>清空筛选/排序</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating bulk action bar */}
      {hasSelectedRecords ? (
        <div className="toolbar-floating-bulk">
          <span className="toolbar-floating-bulk-count">
            {isAllRecordsSelected
              ? `已选择本页全部 ${pageRecordCount}/${pageRecordCount}`
              : `已选择 ${selectedRecordIdsCount}/${pageRecordCount}`}
          </span>
          <div className="toolbar-floating-bulk-divider" />
          {!isAllRecordsSelected && selectedRecordIdsCount > 0 && selectedRecordIdsCount < pageRecordCount ? (
            <button className="toolbar-floating-bulk-btn" onClick={onSelectAllRecords}>
              选择本页全部
            </button>
          ) : null}
          {canDeleteSelectionNow ? (
            <button className="toolbar-floating-bulk-btn toolbar-floating-bulk-btn--danger" onClick={() => void onDeleteSelection()}>
              <DeleteOutlined /> {deleteButtonLabel}
            </button>
          ) : null}
          <button className="toolbar-floating-bulk-btn" onClick={onClearSelectedRecords}>取消选择</button>
        </div>
      ) : null}
    </>
  )
}
