<#
    Aegis Signal — local database setup.

    WHAT THIS DOES
    --------------
    You have forgotten the PostgreSQL superuser password. This is the standard,
    documented recovery: PostgreSQL trusts nothing but its own config file, so we
    temporarily tell it to trust local connections, walk in, set a new password,
    and put the config back exactly as we found it.

    It then creates a database and a role that belong ONLY to this project.

    WHAT IT WILL NOT DO
    -------------------
    · It never opens, reads, alters, or drops any other database.
    · It refuses to continue if `aegis_signal` already exists.
    · The app connects as `aegis`, NOT as `postgres` — so it cannot reach another
      project's data even by accident. That is the whole point of a separate role.

    SAFETY
    ------
    pg_hba.conf is backed up before it is touched, and restored in a `finally`
    block — so it is put back even if something fails halfway. The trust window
    lasts a few seconds and only ever applies to 127.0.0.1.

    HOW TO RUN
    ----------
    Right-click PowerShell → "Run as Administrator", then:

        cd "C:\Users\HP\Desktop\We Projects\Aegis-Signal"
        .\scripts\setup-local-db.ps1
#>

$ErrorActionPreference = "Stop"

# ── Settings ─────────────────────────────────────────────────────────────────
$PgRoot      = "C:\Program Files\PostgreSQL\18"
$Service     = "postgresql-x64-18"
$HbaPath     = "$PgRoot\data\pg_hba.conf"
$Psql        = "$PgRoot\bin\psql.exe"

$DbName      = "aegis_signal"
$DbUser      = "aegis"
$DbPassword  = "aegis_dev_2026"          # local development only
$NewPgPass   = "postgres_dev_2026"       # your new superuser password — write it down

# ── Preflight ────────────────────────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script must run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell -> 'Run as Administrator', then run it again."
    exit 1
}

foreach ($p in @($HbaPath, $Psql)) {
    if (-not (Test-Path $p)) {
        Write-Host "Not found: $p" -ForegroundColor Red
        exit 1
    }
}

$backup = "$HbaPath.aegis-backup"
Copy-Item $HbaPath $backup -Force
Write-Host "Backed up pg_hba.conf -> $backup" -ForegroundColor DarkGray

try {
    # ── 1. Trust local connections, briefly ──────────────────────────────────
    Write-Host "`n[1/5] Temporarily trusting local connections..." -ForegroundColor Cyan

    # Only the loopback host lines. Never 'all' addresses, never remote.
    (Get-Content $HbaPath) `
        -replace '^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)\S+', '$1trust' `
        -replace '^(host\s+all\s+all\s+::1/128\s+)\S+',        '$1trust' |
        Set-Content $HbaPath -Encoding ASCII

    Restart-Service $Service -Force
    Start-Sleep -Seconds 3

    # ── 2. Reset the superuser password ──────────────────────────────────────
    Write-Host "[2/5] Setting a new postgres password..." -ForegroundColor Cyan
    & $Psql -U postgres -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 `
        -c "ALTER USER postgres WITH PASSWORD '$NewPgPass';" | Out-Null

    # ── 3. Refuse to touch an existing database ──────────────────────────────
    Write-Host "[3/5] Checking '$DbName' is free..." -ForegroundColor Cyan
    $exists = & $Psql -U postgres -h 127.0.0.1 -d postgres -tAc `
        "SELECT 1 FROM pg_database WHERE datname = '$DbName';"

    if ($exists -eq "1") {
        Write-Host "'$DbName' already exists. Refusing to touch it." -ForegroundColor Yellow
        Write-Host "Drop it yourself if you want a clean one, then re-run."
        exit 1
    }

    # ── 4. A role and a database that belong only to this project ────────────
    Write-Host "[4/5] Creating role '$DbUser' and database '$DbName'..." -ForegroundColor Cyan

    $roleExists = & $Psql -U postgres -h 127.0.0.1 -d postgres -tAc `
        "SELECT 1 FROM pg_roles WHERE rolname = '$DbUser';"

    if ($roleExists -ne "1") {
        & $Psql -U postgres -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 `
            -c "CREATE ROLE $DbUser WITH LOGIN PASSWORD '$DbPassword';" | Out-Null
    }

    & $Psql -U postgres -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 `
        -c "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null

    # Prisma needs to create the schema it migrates into.
    & $Psql -U postgres -h 127.0.0.1 -d $DbName -v ON_ERROR_STOP=1 `
        -c "GRANT ALL ON SCHEMA public TO $DbUser;" | Out-Null
}
finally {
    # ── 5. Put the config back, whatever happened above ──────────────────────
    Write-Host "[5/5] Restoring pg_hba.conf and restarting..." -ForegroundColor Cyan
    Copy-Item $backup $HbaPath -Force
    Restart-Service $Service -Force
    Start-Sleep -Seconds 2
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host "  Database : $DbName"
Write-Host "  Role     : $DbUser  (owns only this database)"
Write-Host "  postgres : $NewPgPass   <- your new superuser password. Write it down."
Write-Host "`nConnection string for apps/api/.env :" -ForegroundColor DarkGray
Write-Host "  DATABASE_URL=postgresql://${DbUser}:${DbPassword}@localhost:5432/${DbName}"
