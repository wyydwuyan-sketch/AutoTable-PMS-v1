# Frontend (React + Vite)

## Quick Start

```powershell
cd app
npm install
npm run dev
```

Default dev URL:

- `http://127.0.0.1:5173`

## Backend API Configuration

Set API base URL with env:

- `VITE_GRID_API_BASE_URL`

Example (`app/.env.local`):

```env
VITE_GRID_API_BASE_URL=http://127.0.0.1:8000
```

## Auth Behavior (V1)

- Login required for all protected routes.
- Access token sent via `Authorization: Bearer <token>`.
- Backend refresh token uses HttpOnly cookie.
- On `401`, frontend clears session and redirects to `/login`.

## Build

```powershell
cd app
npm run build
```
