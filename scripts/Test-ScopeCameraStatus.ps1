#Requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$statusScript = Join-Path $PSScriptRoot 'Get-ScopeCameraStatus.ps1'
$raw = & $statusScript -Json
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

try {
    $status = $raw | ConvertFrom-Json
} catch {
    Write-Error 'The diagnostic output is not valid JSON.'
    exit 1
}

$failures = [System.Collections.Generic.List[string]]::new()
$validCodes = @('ready', 'descriptor_failure', 'no_usb_data', 'no_camera')
$externalCameras = @($status.cameras.externalUsb)
$presentProblems = @($status.usb.presentProblems)
$dockDevices = @($status.usb.surfaceDockDevices)

if ($status.schemaVersion -ne 1) {
    $failures.Add('schemaVersion must be 1.')
}
if ($status.diagnosis.code -notin $validCodes) {
    $failures.Add("Unexpected diagnosis code: $($status.diagnosis.code)")
}
if (-not $status.driver.ready) {
    $failures.Add('The Microsoft inbox UVC driver was not verified.')
}
if ($status.driver.classBinding -ne 'USB\CLASS_0E') {
    $failures.Add('The UVC class binding must be USB\CLASS_0E.')
}
if ($status.diagnosis.code -eq 'ready' -and $externalCameras.Count -eq 0) {
    $failures.Add('A ready diagnosis requires an external USB camera record.')
}
if ($status.diagnosis.code -eq 'no_usb_data') {
    if ($dockDevices.Count -eq 0) {
        $failures.Add('A no_usb_data diagnosis requires the Surface dock to be present.')
    }
    if ($externalCameras.Count -ne 0) {
        $failures.Add('A no_usb_data diagnosis cannot include an external USB camera.')
    }
    if ($status.usb.lowLevel.descriptorFailure) {
        $failures.Add('A descriptor failure must not be classified as no_usb_data.')
    }
}
if ($status.diagnosis.code -eq 'descriptor_failure') {
    $descriptorProblem = @($presentProblems | Where-Object {
        $_.instanceId -match '^USB\\VID_0000&PID_000[124]' -or
        ($_.hardwareIds -join ';') -match 'DEVICE_DESCRIPTOR_FAILURE'
    }).Count -gt 0
    if (-not $descriptorProblem -and -not $status.usb.lowLevel.descriptorFailure) {
        $failures.Add('A descriptor_failure diagnosis requires current low-level or PnP evidence.')
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

[pscustomobject]@{
    Diagnosis = $status.diagnosis.code
    DriverVersion = $status.driver.version
    ExternalUsbCameras = $externalCameras.Count
    PresentUsbProblems = $presentProblems.Count
    DockPortRecords = @($status.usb.lowLevel.ports).Count
} | Format-List