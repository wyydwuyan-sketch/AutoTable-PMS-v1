import type { ViewConfig } from '../types/grid'

export function createDefaultViewConfig(): ViewConfig {
  return {
    hiddenFieldIds: [],
    fieldOrderIds: [],
    frozenFieldIds: [],
    columnWidths: {},
    sorts: [],
    filters: [],
    isEnabled: true,
    order: 0,
    filterLogic: 'and',
    filterPresets: [],
    compactEmptyRows: false,
    components: {},
  }
}
