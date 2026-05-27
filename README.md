# EV Charging App

## Project Structure

```text
app/
  core/            application settings
  db/
    contracts.py   DB adapter contract used by repositories
    engines/       SQLite and PostgreSQL engine implementations
    session.py     engine factory (`DATABASE_ENGINE`) + shared `db` instance
  repositories/    SQL queries grouped by feature
  routers/         FastAPI route handlers only (no SQL)
  schemas/         Pydantic request/response models only
  services/        external API integrations
data/sqlite/       local SQLite database files (current default)
migrations/
  sqlite/          SQLite migration scripts
  postgres/        PostgreSQL migration scripts
static/            browser frontend files
backend.py         main FastAPI entry point
server.py          alternate compatibility entry point
ev_app.py          optional Streamlit chatbot app
```

## Run the API

```bash
uvicorn backend:app --reload
```

## Database Configuration

By default, the API uses SQLite at `data/sqlite/ev_app.db`.

```bash
set DATABASE_ENGINE=sqlite
set SQLITE_PATH=C:\path\to\ev_app.db
```

When you are ready to switch to PostgreSQL:

```bash
set DATABASE_ENGINE=postgres
set POSTGRES_DSN=postgresql://username:password@localhost:5432/ev_app
```

Then start the same app:

```bash
uvicorn backend:app --reload
```

Realtime EV station lookup works without an API key through OpenStreetMap
Overpass. If you also have an OpenChargeMap key, you can set it before
starting the server:

```bash
set OPENCHARGEMAP_API_KEY=your_api_key_here
uvicorn backend:app --reload
```

To forward a booking to an external station/provider system, set:

```bash
set STATION_BOOKING_URL=https://your-station-provider.example.com/api/bookings
set STATION_BOOKING_API_KEY=your_station_provider_api_key
uvicorn backend:app --reload
```

If these are not set, booking still succeeds in this app but will remain local only.

After a successful booking, the app redirects the user to the payment page.

To notify the station team by email instead, set:

```bash
set STATION_NOTIFICATION_EMAIL=station@example.com
set SMTP_HOST=smtp.example.com
set SMTP_PORT=587
set SMTP_USERNAME=your_smtp_username
set SMTP_PASSWORD=your_smtp_password
set SMTP_FROM_EMAIL=no-reply@example.com
set SMTP_USE_TLS=true
uvicorn backend:app --reload
```

## Station Inbox

Station staff can view incoming booking and payment events inside the app:

```bash
http://127.0.0.1:8000/station-inbox.html
```

The inbox auto-refreshes and shows each booking/payment with map, history, and payment links.

## Deploy for end users (Render)

Give friends a normal website link (no Python or GitHub needed on their side).

1. Push this repo to GitHub (if you have not already).
2. Sign in at [render.com](https://render.com) with GitHub.
3. Click **New +** → **Blueprint** → connect `shankarac/ev-charging-app`.
4. Render reads `render.yaml` and creates the web service. Click **Apply**.
5. Wait until the deploy status is **Live**. Copy the URL, for example:
   `https://ev-charging-app.onrender.com`
6. Send that link to your end user. They open it, **Register**, and use the app.

Notes:

- The first visit after idle time on the free plan can take 30–60 seconds while the server wakes up.
- User accounts and bookings are stored on the server disk configured in `render.yaml`.
- Optional: in Render → your service → **Environment**, set `OPENCHARGEMAP_API_KEY` if you have one.
- `PUBLIC_APP_URL` is picked up automatically from Render’s `RENDER_EXTERNAL_URL`.

## Deploy on Azure

Give friends a normal website link using [Azure App Service](https://azure.microsoft.com/products/app-service).

### Prerequisites

- An [Azure subscription](https://azure.microsoft.com/free/)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`) on your machine
- A globally unique app name (for example `ev-charging-app-yourname`)

Install Azure CLI on Windows:

```powershell
winget install -e --id Microsoft.AzureCLI
```

Then sign in:

```powershell
az login
```

### Option A — PowerShell script (recommended on Windows)

From the repo root:

```powershell
.\scripts\azure_deploy.ps1 -ResourceGroupName ev-charging-rg -AppName ev-charging-app-yourname
```

Optional parameters:

```powershell
.\scripts\azure_deploy.ps1 `
  -ResourceGroupName ev-charging-rg `
  -AppName ev-charging-app-yourname `
  -Location eastus `
  -DatabaseEngine sqlite
```

The script creates the resource group (if needed), deploys `infra/azure/main.bicep`, sets the startup command to `bash scripts/azure_start.sh`, and prints the app URL (`https://{appname}.azurewebsites.net`). A random `SESSION_SECRET` is generated securely and passed to Bicep; it is never written to the repo.

Deploy application code after provisioning:

```powershell
az webapp up --resource-group ev-charging-rg --name ev-charging-app-yourname --runtime "PYTHON:3.12"
```

Or push to `main` after configuring GitHub Actions (see below).

### Option B — Azure CLI + Bicep manually

```powershell
az group create --name ev-charging-rg --location eastus

az deployment group create `
  --resource-group ev-charging-rg `
  --template-file infra/azure/main.bicep `
  --parameters appName=ev-charging-app-yourname sessionSecret="YOUR_STRONG_RANDOM_SECRET"

az webapp config set `
  --resource-group ev-charging-rg `
  --name ev-charging-app-yourname `
  --startup-file "bash scripts/azure_start.sh"

az webapp up --resource-group ev-charging-rg --name ev-charging-app-yourname --runtime "PYTHON:3.12"
```

Replace `YOUR_STRONG_RANDOM_SECRET` with a long random string. Do not commit secrets to git.

### PostgreSQL on Azure (optional)

The default Bicep deployment uses SQLite with persistent storage at `/home/data/ev_app.db`.

To use Azure Database for PostgreSQL Flexible Server:

1. Create a PostgreSQL Flexible Server in the Azure portal (or via `az postgres flexible-server create`).
2. Redeploy Bicep with postgres parameters:

   ```powershell
   az deployment group create `
     --resource-group ev-charging-rg `
     --template-file infra/azure/main.bicep `
     --parameters appName=ev-charging-app-yourname databaseEngine=postgres sessionSecret="YOUR_SECRET" postgresDsn="postgresql://USER:PASSWORD@HOST.postgres.database.azure.com:5432/DB?sslmode=require"
   ```

3. Or set these Application settings in the Azure portal:

   ```text
   DATABASE_ENGINE=postgres
   POSTGRES_DSN=postgresql://USER:PASSWORD@HOST.postgres.database.azure.com:5432/DB?sslmode=require
   DATABASE_URL=<same as POSTGRES_DSN>
   ```

4. Restart the Web App. PostgreSQL migrations in `migrations/postgres/` apply on startup.

### GitHub Actions continuous deployment

Workflow file: `.github/workflows/azure-webapps-python.yml` (runs on push to `main`).

**OIDC (recommended):** create an App Registration / federated credential for GitHub, then set repository secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Set repository variable `AZURE_APP_NAME` to your Web App name.

**Publish profile alternative:** download the publish profile from the Azure portal and set secret `AZURE_WEBAPP_PUBLISH_PROFILE`.

### Azure notes

- `PUBLIC_APP_URL` is detected automatically from Azure’s `WEBSITE_HOSTNAME` environment variable.
- User data (SQLite file) persists under `/home/data` on the App Service plan.
- Startup is handled by `scripts/azure_start.sh` (same pattern as Render’s `scripts/render_start.sh`).
- Oryx build is enabled via `SCM_DO_BUILD_DURING_DEPLOYMENT=true` (also in `.deployment`).

Google one-click sign-in (no app email/password prompt) can be enabled with:

```bash
set GOOGLE_CLIENT_ID=your_google_oauth_client_id
set GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
set GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/auth/google/callback
uvicorn backend:app --reload
```

## PostgreSQL Migration Path

The app now uses an engine adapter pattern:

- repositories run SQL through a shared `db` object
- `app/db/engines/sqlite.py` handles SQLite behavior and migrations
- `app/db/engines/postgres.py` handles PostgreSQL behavior and migrations
- migration history is tracked in `schema_migrations` for both engines

Because repositories stay unchanged, moving from SQLite to PostgreSQL only
requires environment changes plus data migration:

1. Create a PostgreSQL database.
2. Set `DATABASE_ENGINE=postgres` and `POSTGRES_DSN=...`.
3. Start the app once so PostgreSQL migrations in `migrations/postgres` apply.
4. Export data from SQLite:

   ```bash
   python scripts/export_sqlite_data.py
   ```

   This writes CSV files under `data/exports/`.
5. Import data into PostgreSQL tables with matching columns.

The SQL placeholder conversion (`:name` to `%(name)s`) is handled in the
PostgreSQL engine adapter, so repository query files remain portable.
