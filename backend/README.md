# Backend (FastAPI)

## Quick Start

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt
$env:JWT_SECRET="please-use-a-long-random-string-at-least-32-chars"
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

安全提示：
- `JWT_SECRET` 为必填环境变量（至少 32 字符），未设置服务不会启动。
- 若未设置 `SEED_OWNER_PASSWORD`，系统会在首次初始化时生成随机 owner 密码并在控制台输出一次。

## API

- `GET /health`
- `POST /auth/login` with body:
  - `{"username":"owner","password":"<SEED_OWNER_PASSWORD 或首次初始化日志中的随机密码>"}`
- `POST /auth/logout`
- `POST /auth/refresh` (read refresh cookie, issue new access token)
- `GET /auth/me` (Bearer token required)
- `POST /tenants/switch` with body:
  - `{"tenantId":"tenant_default"}`
- `POST /tenants` with body:
  - `{"name":"新租户"}`
- `GET /tenants/current/members` (Owner only)
- `POST /tenants/current/members` with body: (Owner only)
  - `{"username":"member001","password":"<可选，留空则后端随机生成一次性密码>"}`
- `DELETE /tenants/current/members/{userId}` (Owner only)
- `GET /tables/{tableId}/fields`
- `POST /tables/{tableId}/fields` with body:
  - `{"name":"新字段","type":"text","width":180}`
- `GET /tables/{tableId}/views`
- `GET /tables/{tableId}/records?viewId=viw_1&cursor=0&pageSize=100`
- `POST /tables/{tableId}/records/query` with body:
  - `{"viewId":"viw_1","pageSize":100,"filterLogic":"and","filters":[...],"sorts":[...]}`
- `PATCH /records/{recordId}` with body:
  - `{"valuesPatch": {"fld_name": "新值"}}`
  - or `{"fld_name": "新值"}`
- `PATCH /views/{viewId}` with body:
  - `{"config": {"hiddenFieldIds":[],"columnWidths":{},"sorts":[],"filters":[],"filterLogic":"and","filterPresets":[]}}`
- `DELETE /views/{viewId}`
- `POST /tables/{tableId}/records` with body:
  - `{"initialValues": {"fld_name": "新任务"}}`
  - or `{"fld_name": "新任务"}`
- `DELETE /records/{recordId}`
- `DELETE /fields/{fieldId}`

On first startup, DB and seed data are auto-created in `backend/data.db`.

## Test

```powershell
cd backend
.\.venv\Scripts\python -m unittest discover -s tests -p "test_*.py" -v
```

## Security Notes (V1)

- Access token: JWT in `Authorization: Bearer <token>`.
- Refresh token: HttpOnly cookie (`refresh_token`), path `/auth/refresh`.
- CORS:
  - `allow_credentials=true`
  - configurable via `CORS_ALLOW_ORIGINS` (comma-separated)
- Cookie strategy:
  - `SameSite` via `REFRESH_COOKIE_SAMESITE` (default `lax`)
  - `Secure` via `REFRESH_COOKIE_SECURE` (default `false`, production should set `true`)
- Frontend requests must send `credentials: 'include'`.
- 建议在生产环境显式设置 `SEED_OWNER_PASSWORD`，并在首次登录后立即修改。

## Production CORS/Cookie Example

```powershell
$env:CORS_ALLOW_ORIGINS="https://app.example.com"
$env:REFRESH_COOKIE_SAMESITE="none"
$env:REFRESH_COOKIE_SECURE="true"
.\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
