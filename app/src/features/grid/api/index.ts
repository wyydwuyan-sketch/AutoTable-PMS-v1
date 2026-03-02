import type { GridApiClient } from './client'
import { httpGridApi } from './http'
import { mockGridApi } from './mock'

const mode = import.meta.env.VITE_GRID_API_MODE

export const gridApiClient: GridApiClient = mode === 'mock' ? mockGridApi : httpGridApi
