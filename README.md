# Sentient

## Run frontend

```powershell
npm install
npm start
```

Frontend runs on `http://localhost:4200`.

## Run backend

```powershell
cd backend
go mod download
go run .
```

Backend runs on `http://localhost:8080` by default.
Set `PORT` to override (used by most free hosting providers).

## Supabase persistence for Slack signals

1. In Supabase SQL editor, run `backend/supabase_signals.sql`.
2. Set backend env vars:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:SUPABASE_SIGNALS_TABLE="signals"  # optional, default is signals
```

3. Start backend from `backend/`.

When these env vars are set, Slack-imported signals are upserted into Supabase and `/api/signals` reads from Supabase.

Security note: use only the service-role key on backend server side. Never expose it in frontend code.
