import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

const AppShell = lazy(() => import('./app/AppShell').then(m => ({ default: m.AppShell })))
const WorkspaceEntryRedirect = lazy(() => import('./app/WorkspaceEntryRedirect').then(m => ({ default: m.WorkspaceEntryRedirect })))
const GridView = lazy(() => import('./features/grid/gridView/GridView').then(m => ({ default: m.GridView })))
const FormView = lazy(() => import('./features/grid/formView/FormView').then(m => ({ default: m.FormView })))
const KanbanView = lazy(() => import('./features/grid/kanbanView/KanbanView').then(m => ({ default: m.KanbanView })))
const FormViewSetup = lazy(() => import('./features/grid/formView/FormViewSetup').then(m => ({ default: m.FormViewSetup })))
const ViewManagement = lazy(() => import('./features/grid/config/ViewManagement').then(m => ({ default: m.ViewManagement })))
const TableComponents = lazy(() => import('./features/grid/config/TableComponents').then(m => ({ default: m.TableComponents })))
const ComponentShowcase = lazy(() => import('./features/grid/config/ComponentShowcase').then(m => ({ default: m.ComponentShowcase })))
const AiModelsConfig = lazy(() => import('./features/grid/config/AiModelsConfig').then(m => ({ default: m.AiModelsConfig })))
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute').then(m => ({ default: m.ProtectedRoute })))
const MemberManagement = lazy(() => import('./features/auth/MemberManagement').then(m => ({ default: m.MemberManagement })))

const PageLoading = () => (
  <div className="page-loading-skeleton">
    <div className="page-loading-skeleton-inner">
      <div className="cm-skeleton" style={{ width: '22%', height: 22, borderRadius: 6 }} />
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={`page-skeleton-${index}`} className="cm-skeleton" style={{ height: 54, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  </div>
)

function App() {
  const location = useLocation()

  return (
    <Suspense fallback={<PageLoading />}>
      <div className="route-transition-shell">
        <Routes location={location}>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<WorkspaceEntryRedirect />} />
            <Route path="/b/:baseId/t/:tableId/v/:viewId" element={<AppShell />}>
              <Route index element={<GridView />} />
              <Route path="kanban" element={<KanbanView />} />
              <Route path="form" element={<FormView />} />
              <Route path="form-setup" element={<FormViewSetup />} />
              <Route path="config/views" element={<ViewManagement />} />
              <Route path="config/components" element={<TableComponents />} />
              <Route path="config/showcase" element={<ComponentShowcase />} />
              <Route path="config/ai-models" element={<AiModelsConfig />} />
              <Route path="config/members" element={<MemberManagement />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Suspense>
  )
}

export default App
