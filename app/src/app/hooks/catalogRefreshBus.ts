import { useEffect, useState } from 'react'

type Listener = () => void

const DEFAULT_BASE_ID = 'base_1'

const tableCatalogVersions = new Map<string, number>()
const tableCatalogListeners = new Set<Listener>()

let viewCatalogVersion = 0
const viewCatalogListeners = new Set<Listener>()

const subscribe = (listeners: Set<Listener>, listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const emit = (listeners: Set<Listener>) => {
  listeners.forEach((listener) => listener())
}

const getResolvedBaseId = (baseId?: string) => (baseId || DEFAULT_BASE_ID).trim() || DEFAULT_BASE_ID

export const invalidateTableCatalog = (baseId?: string) => {
  const resolvedBaseId = getResolvedBaseId(baseId)
  // Table lists are consumed in multiple screens, so invalidation has to fan out globally.
  tableCatalogVersions.set(resolvedBaseId, (tableCatalogVersions.get(resolvedBaseId) ?? 0) + 1)
  emit(tableCatalogListeners)
}

export const useTableCatalogVersion = (baseId?: string) => {
  const resolvedBaseId = getResolvedBaseId(baseId)
  const [version, setVersion] = useState(() => tableCatalogVersions.get(resolvedBaseId) ?? 0)

  useEffect(() => {
    setVersion(tableCatalogVersions.get(resolvedBaseId) ?? 0)
    return subscribe(tableCatalogListeners, () => {
      setVersion(tableCatalogVersions.get(resolvedBaseId) ?? 0)
    })
  }, [resolvedBaseId])

  return version
}

export const invalidateViewCatalog = () => {
  // View and folder CRUD affects both the config pages and the AppShell sidebar.
  viewCatalogVersion += 1
  emit(viewCatalogListeners)
}

export const useViewCatalogVersion = () => {
  const [version, setVersion] = useState(viewCatalogVersion)

  useEffect(
    () =>
      subscribe(viewCatalogListeners, () => {
        setVersion(viewCatalogVersion)
      }),
    [],
  )

  return version
}
