import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

const AppShell = lazy(() => import('./app/AppShell').then(m => ({ default: m.AppShell })))
const GridView = lazy(() => import('./features/grid/gridView/GridView').then(m => ({ default: m.GridView })))
const FormView = lazy(() => import('./features/grid/formView/FormView').then(m => ({ default: m.FormView })))
const KanbanView = lazy(() => import('./features/grid/kanbanView/KanbanView').then(m => ({ default: m.KanbanView })))
const FormViewSetup = lazy(() => import('./features/grid/formView/FormViewSetup').then(m => ({ default: m.FormViewSetup })))
const ViewManagement = lazy(() => import('./features/grid/config/ViewManagement').then(m => ({ default: m.ViewManagement })))
const TableComponents = lazy(() => import('./features/grid/config/TableComponents').then(m => ({ default: m.TableComponents })))
const ComponentShowcase = lazy(() => import('./features/grid/config/ComponentShowcase').then(m => ({ default: m.ComponentShowcase })))
const WorkflowConfigPage = lazy(() => import('./features/grid/workflow/WorkflowConfigPage').then(m => ({ default: m.WorkflowConfigPage })))
const AiModelsConfig = lazy(() => import('./features/grid/config/AiModelsConfig').then(m => ({ default: m.AiModelsConfig })))
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute').then(m => ({ default: m.ProtectedRoute })))
const MemberManagement = lazy(() => import('./features/auth/MemberManagement').then(m => ({ default: m.MemberManagement })))
const IntegrationsLayout = lazy(() => import('./features/integrations/pages/IntegrationsLayout'))
const IntegrationDashboard = lazy(() => import('./features/integrations/pages/IntegrationDashboard'))
const IntegrationList = lazy(() => import('./features/integrations/pages/IntegrationList'))
const IntegrationCreate = lazy(() => import('./features/integrations/pages/IntegrationCreate'))
const IntegrationSchedule = lazy(() => import('./features/integrations/pages/IntegrationSchedule'))
const IntegrationLogs = lazy(() => import('./features/integrations/pages/IntegrationLogs'))
const CredentialManagement = lazy(() => import('./features/integrations/pages/CredentialManagement'))
const FileRecords = lazy(() => import('./features/integrations/pages/FileRecords'))
const UploadConfig = lazy(() => import('./features/integrations/pages/UploadConfig'))
const NotifySettings = lazy(() => import('./features/integrations/pages/NotifySettings'))
const FieldTemplate = lazy(() => import('./features/integrations/pages/FieldTemplate'))
const ExcelTemplate = lazy(() => import('./features/integrations/pages/ExcelTemplate'))

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
          <Route path="/" element={<Navigate to="/b/base_1/t/tbl_1/v/viw_1" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/integrations" element={<IntegrationsLayout />}>
              <Route index element={<IntegrationDashboard />} />
              <Route path="list" element={<IntegrationList />} />
              <Route path="list/create" element={<IntegrationCreate />} />
              <Route path="schedule" element={<IntegrationSchedule />} />
              <Route path="logs" element={<IntegrationLogs />} />
              <Route path="credentials" element={<CredentialManagement />} />
              <Route path="files" element={<FileRecords />} />
              <Route path="upload-config" element={<UploadConfig />} />
              <Route path="notify" element={<NotifySettings />} />
              <Route path="field-template" element={<FieldTemplate />} />
              <Route path="excel-template" element={<ExcelTemplate />} />
            </Route>
            <Route path="/b/:baseId/t/:tableId/v/:viewId" element={<AppShell />}>
              <Route index element={<GridView />} />
              <Route path="kanban" element={<KanbanView />} />
              <Route path="form" element={<FormView />} />
              <Route path="form-setup" element={<FormViewSetup />} />
              <Route path="config/views" element={<ViewManagement />} />
              <Route path="config/components" element={<TableComponents />} />
              <Route path="config/showcase" element={<ComponentShowcase />} />
              <Route path="config/workflow" element={<WorkflowConfigPage />} />
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
