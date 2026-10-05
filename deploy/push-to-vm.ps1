<#
.SYNOPSIS
    Pushes the gitignored deploy artefacts (both .env files, and optionally a
    fresh database dump) from this PC to the VM over SSH.

.DESCRIPTION
    The code itself is NOT transferred -- the VM clones it from GitHub, because
    node_modules contains a canvas binary built for Windows. This script only
    moves the files that .gitignore keeps out of the repository.

    Nothing is written to disk here except the temporary dump, which is deleted
    in a finally block. Secrets are never echoed.

.PARAMETER Vm
    The SSH destination, e.g. alice@203.0.113.10 or aesthetic-vm.

.PARAMETER ServiceUser
    The account the systemd units run as, which must own the .env files.
    Must match User= in deploy/systemd/*.service.

.EXAMPLE
    .\deploy\push-to-vm.ps1 -Vm alice@203.0.113.10
    Copies both .env files and dumps + uploads the database.

.EXAMPLE
    .\deploy\push-to-vm.ps1 -Vm alice@203.0.113.10 -EnvOnly
    Refreshes only the secrets; leaves the database alone.

.NOTES
    After this finishes you still have to run the restore on the VM and restart
    the services. The script prints both commands.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Vm,

    [string]$RemoteDir = "/opt/aesthetic-king",

    [string]$ServiceUser = "aesthetic",

    [int]$SshPort = 22,

    [switch]$EnvOnly,

    [switch]$SkipEnv
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param([string]$Label, [scriptblock]$Body)
    Write-Host "-> $Label" -ForegroundColor Cyan
    & $Body
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed (exit $LASTEXITCODE)"
    }
}

# Windows PowerShell 5.1 rebuilds the argument line for native commands itself
# and mishandles embedded double quotes, so remote commands are deliberately
# built from bare tokens only. Anything that would need quoting is rejected here
# rather than silently re-parsed by the remote shell.
function Assert-ShellSafe {
    param([string]$Name, [string]$Value)
    if ($Value -notmatch '^[A-Za-z0-9_./:@+-]+$') {
        throw "$Name contains characters outside [A-Za-z0-9_./:@+-], which this script cannot pass to a remote shell safely: $Value"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$botEnv = Join-Path $repoRoot ".env"
$studioEnv = Join-Path $repoRoot "studio\.env.local"

foreach ($f in @($botEnv, $studioEnv)) {
    if (-not (Test-Path $f)) {
        throw "Missing $f. This script copies the real secrets, so they have to exist locally first."
    }
}

Write-Host "Repository: $repoRoot"
Write-Host "Destination: $Vm (port $SshPort)"
Write-Host ""

Invoke-Step "Checking SSH connectivity" {
    ssh -p $SshPort $Vm "exit 0"
}

Assert-ShellSafe "RemoteDir" $RemoteDir
Assert-ShellSafe "ServiceUser" $ServiceUser
Assert-ShellSafe "Vm" $Vm

Invoke-Step "Checking the remote directory exists" {
    # studio/ is inside RemoteDir, so one test covers both.
    ssh -p $SshPort $Vm "test -d $RemoteDir/studio"
}

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

# Uploaded with a per-run suffix so two people deploying at once cannot
# overwrite each other, and so a crash cannot leave a file the next run
# silently reuses.
$suffix = "-{0}-{1}" -f (Get-Date -Format "yyyyMMddHHmmss"), $PID
$dumpRemotePath = $null

try {
    if (-not $SkipEnv) {
        $botTmp = "/tmp/bot.env$suffix"
        $studioTmp = "/tmp/studio.env$suffix"

        Invoke-Step "Uploading .env files" {
            scp -P $SshPort $botEnv "${Vm}:$botTmp"
            if ($LASTEXITCODE -ne 0) { throw "scp of .env failed (exit $LASTEXITCODE)" }
            scp -P $SshPort $studioEnv "${Vm}:$studioTmp"
            if ($LASTEXITCODE -ne 0) { throw "scp of studio/.env.local failed (exit $LASTEXITCODE)" }
        }

        # install(1) sets owner, group and mode in one step, so the secrets are
        # never sitting in /tmp readable by other users for longer than this
        # single command takes. The SSH login is not root, and only root can
        # hand a file to another owner, so these need sudo. shred -u removes the
        # temp copies instead of just unlinking them.
        Invoke-Step "Installing .env files as $ServiceUser, mode 600" {
            $cmd = "set -e; " +
                "sudo install -d -o $ServiceUser -g $ServiceUser -m 755 $RemoteDir/studio; " +
                "sudo install -o $ServiceUser -g $ServiceUser -m 600 $botTmp $RemoteDir/.env; " +
                "sudo install -o $ServiceUser -g $ServiceUser -m 600 $studioTmp $RemoteDir/studio/.env.local; " +
                "shred -u $botTmp $studioTmp 2>/dev/null || rm -f $botTmp $studioTmp"
            ssh -p $SshPort $Vm $cmd
        }
    }

    # -----------------------------------------------------------------------
    # Database
    # -----------------------------------------------------------------------

    if (-not $EnvOnly) {
        $envText = Get-Content $botEnv -Raw
        if ($envText -notmatch '(?m)^\s*DATABASE_URL\s*=\s*"?(?<url>[^"\r\n]+)"?') {
            throw "Could not find DATABASE_URL in .env, so the database name is unknown. Pass it explicitly or fix .env."
        }
        $url = $Matches.url
        if ($url -notmatch '^postgres(?:ql)?://(?:(?<user>[^:@]*)(?::[^@]*)?@)?(?<host>[^:/]+)(?::(?<port>\d+))?/(?<db>[^?]+)') {
            throw "DATABASE_URL is not a postgres URL I can parse: $url"
        }
        $dbName = $Matches.db
        # Dump as the role the app actually uses. It owns the database, so it
        # needs no superuser password, and it avoids asking for a postgres
        # password that is often not even set on a dev machine.
        $dbUser = if ($Matches.user) { $Matches.user } else { "postgres" }
        $dbPort = if ($Matches.port) { $Matches.port } else { "5432" }
        Write-Host "Local database: $dbName as $dbUser"

        $pgDump = $null
        $onPath = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
        if ($onPath) {
            $pgDump = $onPath.Source
        } else {
            # Prefer the newest installed server; it must be >= the server
            # version or pg_dump refuses to dump it. Sort numerically rather
            # than via [version], which rejects a bare major like "18" on
            # Windows PowerShell.
            $candidate = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^\d+$' } |
                Sort-Object { [int]$_.Name } -Descending |
                ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
            if ($candidate) { $pgDump = $candidate }
        }
        if (-not $pgDump) {
            throw "pg_dump.exe not found on PATH or under C:\Program Files\PostgreSQL. Install the client tools, or run with -EnvOnly."
        }
        Write-Host "Using $pgDump"

        $localDump = Join-Path $env:TEMP "aesthetic-dump-$suffix.sql"
        try {
            # pg_dump prompts for the password itself; no password is stored or
            # passed on the command line where it would show in the process
            # list. --no-owner matters: the local role is not called
            # $ServiceUser, so the dump would otherwise be full of
            # "OWNER TO aesthetic_king" statements that all fail on the VM.
            # --no-privileges drops the GRANT lines for the same reason -- the
            # restore target grants access through ownership instead.
            Invoke-Step "Dumping $dbName (you will be prompted for $dbUser's password)" {
                & $pgDump -U $dbUser -h localhost -p $dbPort --no-owner --no-privileges -f $localDump $dbName
            }

            $sizeMb = [math]::Round((Get-Item $localDump).Length / 1MB, 2)
            Write-Host "   dump is $sizeMb MB"

            $dumpRemotePath = "/tmp/ak-dump$suffix.sql"
            Invoke-Step "Uploading the dump" {
                scp -P $SshPort $localDump "${Vm}:$dumpRemotePath"
            }
            # The dump contains password hashes and encrypted OAuth tokens, so
            # it must not be world-readable while it waits on the VM. scp has
            # already run, so this only tightens an existing file.
            Invoke-Step "Restricting permissions on the uploaded dump" {
                ssh -p $SshPort $Vm "sudo chmod 600 $dumpRemotePath"
            }
        } finally {
            Remove-Item $localDump -Force -ErrorAction SilentlyContinue
        }
    }
}
catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "If the .env upload reported success but a later step failed, per-run copies may" -ForegroundColor Yellow
    Write-Host "still be in /tmp on the VM. Remove them with:" -ForegroundColor Yellow
    Write-Host "  sudo rm -f /tmp/bot.env$suffix /tmp/studio.env$suffix /tmp/ak-dump$suffix.sql" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green

if ($dumpRemotePath) {
    Write-Host ""
    Write-Host "Next, on the VM:" -ForegroundColor Yellow
    Write-Host "  sudo chmod a+r $dumpRemotePath" -ForegroundColor Gray
    Write-Host "  sudo -u $ServiceUser psql -d aesthetic -v ON_ERROR_STOP=1 -f $dumpRemotePath" -ForegroundColor Gray
    Write-Host "  shred -u $dumpRemotePath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Restore as the $ServiceUser role, not as the postgres superuser: the dump was"
    Write-Host "written with --no-owner, so whoever runs the restore ends up owning the tables,"
    Write-Host "and Prisma needs that ownership to ALTER them later."
    Write-Host ""
    Write-Host "Then: sudo systemctl restart aesthetic-studio aesthetic-bot"
} else {
    Write-Host "Restart the services if the secrets changed:" -ForegroundColor Yellow
    Write-Host "  sudo systemctl restart aesthetic-studio aesthetic-bot" -ForegroundColor Gray
}
