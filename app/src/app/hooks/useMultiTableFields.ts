import { useCallback, useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../../features/grid/api'
import type { Field } from '../../features/grid/types/grid'

type TableItemLike = {
  id: string
  name: string
}

export interface UseMultiTableFieldsParams {
  tableItems: Array<TableItemLike>
}

export interface UseMultiTableFieldsResult {
  fieldsByTableId: Record<string, Field[]>
  allFields: Field[]
  isLoading: boolean
  refreshFields: () => void
}

const buildEmptyFieldMap = (tableItems: TableItemLike[]) =>
  tableItems.reduce<Record<string, Field[]>>((acc, item) => {
    acc[item.id] = []
    return acc
  }, {})

export function useMultiTableFields({
  tableItems,
}: UseMultiTableFieldsParams): UseMultiTableFieldsResult {
  const [rawFieldsByTableId, setRawFieldsByTableId] = useState<Record<string, Field[]>>(() => buildEmptyFieldMap(tableItems))
  const [isLoading, setIsLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const tableIdsKey = useMemo(() => tableItems.map((item) => item.id).join('|'), [tableItems])
  const refreshFields = useCallback(() => {
    setRefreshTick((current) => current + 1)
  }, [])

  useEffect(() => {
    if (tableItems.length === 0) {
      setRawFieldsByTableId({})
      setIsLoading(false)
      return
    }

    let active = true
    setIsLoading(true)

    void (async () => {
      const entries: Array<[string, Field[]]> = await Promise.all(
        tableItems.map(async (item) => {
          try {
            const fields = await gridApiClient.getFields(item.id)
            return [item.id, fields.filter((field) => field.tableId === item.id)]
          } catch (error) {
            console.error(`[useMultiTableFields] 加载数据表字段失败: ${item.id}`, error)
            return [item.id, []]
          }
        }),
      )

      if (!active) return

      const nextMap = buildEmptyFieldMap(tableItems)
      for (const [tableId, fields] of entries) {
        nextMap[tableId] = fields
      }
      setRawFieldsByTableId(nextMap)
      setIsLoading(false)
    })()

    return () => {
      active = false
    }
  }, [refreshTick, tableIdsKey, tableItems])

  const fieldsByTableId = useMemo(() => {
    const nextMap = buildEmptyFieldMap(tableItems)
    for (const item of tableItems) {
      nextMap[item.id] = rawFieldsByTableId[item.id] ?? []
    }
    return nextMap
  }, [rawFieldsByTableId, tableItems])

  const allFields = useMemo(
    () => tableItems.flatMap((item) => fieldsByTableId[item.id] ?? []),
    [fieldsByTableId, tableItems],
  )

  return {
    fieldsByTableId,
    allFields,
    isLoading,
    refreshFields,
  }
}
