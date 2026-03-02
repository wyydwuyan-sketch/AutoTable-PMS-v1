# AutoTable-PMS-v1 技术架构与已实现功能说明

> 版本快照：基于当前仓库代码整理（截至 2026-02-28）

## 1. 项目定位

当前项目已经具备“基础视图表格平台 + 可叠加业务能力”的核心形态，底座以通用数据模型与视图配置为中心，业务能力通过权限、工作流、看板、仪表盘等模块组合实现。

## 2. 技术栈总览

### 2.1 前端

- React 19 + TypeScript + Vite 7
- Ant Design 6
- Zustand（状态管理）
- React Router 7（路由）
- react-grid-layout（布局）
- react-window（虚拟滚动）
- xlsx + file-saver（导入导出）

### 2.2 后端

- FastAPI + Uvicorn
- SQLAlchemy（ORM）
- Pydantic（请求/响应模型）
- PyJWT + passlib[bcrypt]（认证与密码）
- SQLite（当前默认数据库）

### 2.3 测试

- Playwright UI 自动化：`Test/ui`
- 后端接口冒烟测试：`backend/tests/test_api_smoke.py`
- 测试清单：`Test/TEST_CASES.md`

## 3. 总体架构

### 3.1 架构分层

- 前端应用层（`app/src`）：页面、交互、状态、组件配置、路由守卫。
- 后端 API 层（`backend/app/routes`）：按领域拆分 REST API。
- 领域/服务层（`backend/app/services.py` 等）：统计聚合、规则处理、权限应用。
- 数据持久层（`backend/app/models.py` + `db.py`）：多租户+表格元数据+业务对象。

### 3.2 启动与装配

- 后端入口：`backend/app/main.py`
- 启动时执行：
- 初始化数据库连接与表结构
- 轻量 schema 升级（`ensure_schema_upgrades`）
- 种子数据初始化（`ensure_seed_data`）
- 装配路由：`health`、`auth`、`tenants`、`permissions`、`grid_resources`、`dashboards`、`workflow`

## 4. 后端核心设计

### 4.1 多租户与权限模型

- 多租户核心实体：`Tenant`、`User`、`Membership`、`TenantRole`
- 资源权限实体：`TablePermission`、`ViewPermission`
- 细粒度操作权限：表按钮权限（按钮级授权接口已实现）
- 支持按角色批量应用默认权限

### 4.2 表格平台核心数据模型

- 容器层：`Base` -> `Table` -> `View`
- 字段与数据：`Field`、`Record`、`RecordValue`
- 支持视图维度配置、字段配置、记录级读写
- 记录更新支持版本冲突检测（乐观锁，`expectedVersion`）

### 4.3 工作流与状态流转

- `TableWorkflowConfig`、`WorkflowTransition`
- 记录状态日志：`RecordStatusLog`
- 视图标签：`ViewTab`
- 支持看板列数据与卡片拖拽流转接口

### 4.4 仪表盘能力

- `Dashboard`、`DashboardWidget`
- 支持指标/柱状/折线/饼图/表格等组件的数据聚合
- 按时间维度桶聚合（用于折线等图表）

### 4.5 认证机制

- JWT Access Token + Refresh Cookie
- 登录/登出/刷新/me 接口完整
- 支持首次登录强制修改密码流程

## 5. 前端核心设计

### 5.1 路由与页面骨架

- 入口：`app/src/main.tsx`
- 顶层路由：`app/src/App.tsx`
- 鉴权守卫：`app/src/auth/ProtectedRoute.tsx`
- 主业务路由：`/b/:baseId/t/:tableId/v/:viewId`

### 5.2 关键模块

- 表格视图：`features/grid/pages/GridView.tsx`
- 表单视图与设计器：`features/grid/pages/FormView.tsx`、`FormViewSetup.tsx`
- 看板视图：`features/grid/pages/KanbanView.tsx`
- 视图管理：`features/config/ViewManagement.tsx`
- 字段组件配置：`features/config/TableComponents.tsx`
- 工作流配置：`features/workflow/WorkflowConfigPage.tsx`
- 仪表盘配置与展示：`features/dashboard/*`
- 成员与权限管理：`features/auth/MemberManagement.tsx`

### 5.3 状态与请求

- 全局认证状态：`features/auth/authStore.ts`
- 表格域状态：`features/grid/store/gridStore.ts`
- 仪表盘状态：`features/dashboard/dashboardStore.ts`
- 请求封装：`utils/request.ts`（含 401 刷新重试）
- API 模式切换：`VITE_GRID_API_MODE=mock|api`

## 6. 已实现功能清单（按业务能力）

### 6.1 账号与登录

- 登录/登出/刷新 token
- 会话续期与失效处理
- 首次登录改密

### 6.2 租户与成员

- 租户创建/切换
- 成员增删改
- 角色管理
- 角色默认权限下发

### 6.3 视图表格底座

- 表字段与记录 CRUD
- 视图 CRUD（含重命名、排序、启停、删除）
- 过滤、排序、分页查询
- 导入/导出（含视图 bundle 能力）
- 列显隐、冻结、调整宽度、虚拟滚动

### 6.4 视图类型

- Grid 视图
- Form 视图（填写与配置分离）
- Kanban 视图（状态列拖拽流转）

### 6.5 组件与配置能力

- 字段组件配置页
- 视图字段可见性/顺序/搜索过滤配置
- 组件展示页（Showcase）

### 6.6 权限与流程

- 表/视图权限管理
- 按钮级权限管理
- 工作流状态与流转配置
- 流转日志记录

### 6.7 分析与可视化

- 仪表盘与部件 CRUD
- 常见图表组件数据聚合

## 7. 你关心的流程覆盖情况

你提到的流程“登录 -> 新增视图 -> 配置视图字段 -> 配置视图字段组件”在当前产品能力上已经具备页面与接口支撑：

- 登录：`/login`
- 新增/管理视图：`ViewManagement`
- 配置视图字段：`ViewSetupWizard` / 相关配置页
- 配置字段组件：`TableComponents`

这说明平台底座已经能承载“先搭通用视图，再叠加业务规则”的实施路径。

## 8. 对“基础视图表格平台 + 自定义业务”的适配评估

### 8.1 已具备的支撑点

- 数据模型抽象清晰（Base/Table/View/Field/Record）
- 多租户 + 角色 + 资源权限链路完整
- 视图、工作流、仪表盘三类通用能力已落地
- 前后端模块边界较清楚，后续可按领域增量扩展

### 8.2 当前主要缺口（建议）

- 业务插件化扩展点需要进一步标准化（事件钩子/策略接口）
- 元数据版本管理与变更回滚能力可加强
- 自动化测试对关键业务流程的端到端覆盖仍需补齐

### 8.3 结论

当前架构可以支持向“基础视图表格平台 + 自定义业务”演进，且已经完成核心底座。下一步重点应放在扩展机制标准化与关键流程测试完善，以支撑规模化业务接入。

## 9. 建议的近期行动

1. 补齐端到端流程用例：登录 -> 新增视图 -> 配置字段 -> 配置组件。
2. 增加权限边界回归用例：不同角色对同一视图/按钮的行为差异。
3. 定义业务扩展约定：前端扩展点、后端策略接口、元数据变更规范。

