#Requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateSet('Development', 'Production')]
    [string]$Mode = 'Development',

    [switch]$NoOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$npm = Get-Command npm.cmd, npm -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $npm) {
    Write-Error 'Node.js and npm are required. Install the current Node.js LTS release, then retry.'
    exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    & $npm.Source install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if ($Mode -eq 'Production') {
    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    $arguments = @('run', 'start')
} else {
    $arguments = @('run', 'dev')
}

if (-not $NoOpen) {
    $arguments += @('--', '--open')
}

& $npm.Source @arguments
exit $LASTEXITCODE