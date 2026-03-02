# AutoTable UI 自动化测试

## 目录结构
- `playwright.config.ts`: Playwright 配置
- `ui/helpers.ts`: 公共步骤与断言
- `ui/auth.module.spec.ts`: 认证模块用例
- `ui/records.module.spec.ts`: 记录模块用例
- `ui/views.module.spec.ts`: 视图配置模块用例
- `ui/components.module.spec.ts`: 视图组件配置模块用例
- `ui/showcase.module.spec.ts`: 组件参考模块用例
- `TEST_CASES.md`: 用例说明清单

## 运行前准备
1. 进入 `Test` 目录安装依赖：
```powershell
npm install
```
2. 安装浏览器驱动：
```powershell
npm run install:browsers
```

## 运行方式

### 方式 A：由 Playwright 自动拉起前后端（默认）
```powershell
npm run test:ui
```
默认以可见模式（headed）执行，便于现场观察用例过程。

默认会尝试启动：
- 后端：`../backend/.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- 前端：`npm run dev -- --host 127.0.0.1 --port 5173`（cwd=`../app`）

### 方式 B：使用你已手动启动的服务
```powershell
$env:PW_NO_WEBSERVER='1'
npm run test:ui
```

## 可选环境变量
- `E2E_ADMIN_USERNAME`：默认 `admin`
- `E2E_ADMIN_PASSWORD`：默认 `admin123`
- `UI_BASE_URL`：默认 `http://127.0.0.1:5173`

示例：
```powershell
$env:E2E_ADMIN_USERNAME='admin'
$env:E2E_ADMIN_PASSWORD='admin123'
npm run test:ui:headless
```

## 失败截图与结果保留
- 每个用例在失败结束时会额外执行一次全页截图（`failed-end.png`）
- 失败截图会附加到 Playwright 报告，并保存在 `test-results` 对应用例目录中
