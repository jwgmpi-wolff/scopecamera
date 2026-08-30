#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$deviceRecordKeys = @(
    'DEVPKEY_Device_HardwareIds',
    'DEVPKEY_Device_CompatibleIds',
    'DEVPKEY_Device_LocationPaths',
    'DEVPKEY_Device_Service',
    'DEVPKEY_Device_BusReportedDeviceDesc',
    'DEVPKEY_Device_ProblemCode',
    'DEVPKEY_Device_Parent',
    'DEVPKEY_Device_LocationInfo',
    'DEVPKEY_Device_IsPresent',
    'DEVPKEY_Device_FirstInstallDate',
    'DEVPKEY_Device_LastArrivalDate',
    'DEVPKEY_Device_LastRemovalDate'
)

function Get-DeviceRecords {
    param(
        [Parameter(Mandatory)]
        [array]$Devices
    )

    if ($Devices.Count -eq 0) {
        return @()
    }

    $propertiesByInstance = @{}
    Get-PnpDeviceProperty -InstanceId $Devices.InstanceId -KeyName $deviceRecordKeys -ErrorAction SilentlyContinue |
        Group-Object InstanceId |
        ForEach-Object {
            $bucket = @{}
            foreach ($item in $_.Group) {
                $dataProperty = $item.PSObject.Properties['Data']
                $bucket[$item.KeyName] = if ($null -ne $dataProperty) { $dataProperty.Value } else { $null }
            }
            $propertiesByInstance[$_.Name] = $bucket
        }

    foreach ($device in $Devices) {
        $instanceId = [string]$device.InstanceId
        $properties = if ($propertiesByInstance.ContainsKey($instanceId)) { $propertiesByInstance[$instanceId] } else { @{} }
        $hardwareIds = @($properties['DEVPKEY_Device_HardwareIds'])
        $compatibleIds = @($properties['DEVPKEY_Device_CompatibleIds'])
        $locationPaths = @($properties['DEVPKEY_Device_LocationPaths'])
        $service = [string]$properties['DEVPKEY_Device_Service']
        $busDescription = [string]$properties['DEVPKEY_Device_BusReportedDeviceDesc']
        $problemCode = $properties['DEVPKEY_Device_ProblemCode']
        $vendorId = $null
        $productId = $null

        if ($instanceId -match 'VID_([0-9A-Fa-f]{4})') {
            $vendorId = $Matches[1].ToUpperInvariant()
        }
        if ($instanceId -match 'PID_([0-9A-Fa-f]{4})') {
            $productId = $Matches[1].ToUpperInvariant()
        }

        [pscustomobject][ordered]@{
            name = [string]$device.FriendlyName
            status = [string]$device.Status
            class = [string]$device.Class
            instanceId = $instanceId
            vendorId = $vendorId
            productId = $productId
            service = $service
            busDescription = $busDescription
            hardwareIds = @($hardwareIds | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ })
            compatibleIds = @($compatibleIds | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ })
            parent = [string]$properties['DEVPKEY_Device_Parent']
            location = [string]$properties['DEVPKEY_Device_LocationInfo']
            locationPaths = @($locationPaths | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ })
            problemCode = if ($null -eq $problemCode) { 0 } else { [int]$problemCode }
            present = [bool]$properties['DEVPKEY_Device_IsPresent']
            firstInstall = [string]$properties['DEVPKEY_Device_FirstInstallDate']
            lastArrival = [string]$properties['DEVPKEY_Device_LastArrivalDate']
            lastRemoval = [string]$properties['DEVPKEY_Device_LastRemovalDate']
        }
    }
}

function Get-UsbTreeViewPath {
    $paths = [System.Collections.Generic.List[string]]::new()
    $command = Get-Command UsbTreeView.exe -ErrorAction SilentlyContinue
    if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) {
        $paths.Add($command.Source)
    }

    $packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    Get-ChildItem $packageRoot -Directory -Filter 'UweSieber.UsbTreeView*' -ErrorAction SilentlyContinue |
        ForEach-Object {
            $candidate = Join-Path $_.FullName 'UsbTreeView.exe'
            if (Test-Path $candidate) {
                $paths.Add($candidate)
            }
        }

    return $paths | Select-Object -Unique -First 1
}

function Get-LowLevelUsbStatus {
    $usbTreeViewPath = Get-UsbTreeViewPath
    if ([string]::IsNullOrWhiteSpace($usbTreeViewPath)) {
        return [pscustomobject][ordered]@{
            available = $false
            tool = $null
            version = $null
            descriptorFailure = $false
            uvcDescriptor = $false
            ports = @()
            error = 'USBTreeView is not installed.'
        }
    }

    $reportPath = Join-Path $env:TEMP ('ScopeCamera-UsbTreeView-{0}.txt' -f [guid]::NewGuid().ToString('N'))
    try {
        $process = Start-Process -FilePath $usbTreeViewPath -ArgumentList @('-R="' + $reportPath + '"') -PassThru -WindowStyle Hidden
        $exited = $process.WaitForExit(8000)
        if (-not $exited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            throw 'USBTreeView report timed out after 8 seconds and was terminated.'
        }
        if ($process.ExitCode -ne 0 -or -not (Test-Path $reportPath)) {
            throw "USBTreeView report failed with exit code $($process.ExitCode)."
        }

        $report = Get-Content $reportPath -Raw
        $portPattern = '(?ms)^    =========================== USB Port(?<port>\d+) ===========================\s*\r?\n\s*\r?\nConnection Status\s*:\s*(?<status>[^\r\n]+).*?^Port Chain\s*:\s*(?<chain>[^\r\n]+)(?<body>.*?)(?=^    =========================== USB Port|\z)'
        $ports = foreach ($portMatch in [regex]::Matches($report, $portPattern)) {
            $body = $portMatch.Groups['body'].Value
            $nameMatch = [regex]::Match($body, '(?m)^Product String\s*:\s*"?([^"\r\n]+)')
            if (-not $nameMatch.Success) {
                $nameMatch = [regex]::Match($body, '(?m)^BusReported Device Desc\s*:\s*([^\r\n]+)')
            }

            [pscustomobject][ordered]@{
                chain = $portMatch.Groups['chain'].Value.Trim()
                status = $portMatch.Groups['status'].Value.Trim()
                connected = $portMatch.Groups['status'].Value -match '^0x01\b'
                device = if ($nameMatch.Success) { $nameMatch.Groups[1].Value.Trim() } else { $null }
            }
        }

        $dockPort = $ports | Where-Object { $_.device -match 'Surface Thunderbolt\(TM\) 4 Dock' } | Select-Object -First 1
        $dockRoot = if ($null -ne $dockPort) { ($dockPort.chain -split '-')[0] } else { $null }
        $dockPorts = if ($null -ne $dockRoot) {
            @($ports | Where-Object { $_.chain -like "$dockRoot-*" })
        } else {
            @()
        }

        return [pscustomobject][ordered]@{
            available = $true
            tool = $usbTreeViewPath
            version = (Get-Item $usbTreeViewPath).VersionInfo.FileVersion
            descriptorFailure = [bool]($report -match 'VID_0000&PID_000[124]|Device Descriptor Request Failed|DeviceFailedEnumeration|No response from USB device')
            uvcDescriptor = [bool]($report -match 'Service\s*:\s*usbvideo|bInterfaceClass\s*:\s*0x0E|USB Video Class|\bUVC\b')
            ports = $dockPorts
            error = $null
        }
    } catch {
        return [pscustomobject][ordered]@{
            available = $false
            tool = $usbTreeViewPath
            version = (Get-Item $usbTreeViewPath -ErrorAction SilentlyContinue).VersionInfo.FileVersion
            descriptorFailure = $false
            uvcDescriptor = $false
            ports = @()
            error = $_.Exception.Message
        }
    } finally {
        Remove-Item $reportPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-DirectShowVideoDevices {
    $ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if ($null -eq $ffmpeg) {
        return @()
    }

    $output = & $ffmpeg.Source -hide_banner -list_devices true -f dshow -i dummy 2>&1 | ForEach-Object { $_.ToString() }
    $names = foreach ($line in $output) {
        if ($line -match '"([^"]+)" \(video\)') {
            $Matches[1]
        }
    }

    return @($names | Select-Object -Unique)
}

$presentDevices = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -like 'USB\*' -or $_.Class -eq 'Camera' })
$presentRecords = @(Get-DeviceRecords -Devices $presentDevices)
$cameraDevices = @($presentRecords | Where-Object { $_.class -eq 'Camera' })
$usbCameras = @($cameraDevices | Where-Object {
    $_.instanceId -like 'USB\*' -or
    $_.service -eq 'usbvideo' -or
    (($_.hardwareIds + $_.compatibleIds) -join ';') -match 'USB\\|Class_0E'
})
$presentUsbProblems = @($presentRecords | Where-Object {
    $_.instanceId -like 'USB\*' -and ($_.problemCode -ne 0 -or $_.status -ne 'OK')
})
$dockDevices = @($presentRecords | Where-Object {
    $_.name -match 'Surface Thunderbolt\(TM\) 4 Dock|Generic (SuperSpeed )?USB Hub' -or
    $_.instanceId -match '^USB\\VID_045E&PID_085[5789]'
})

$historicalFailureDevices = @(Get-PnpDevice -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FriendlyName -match 'Unknown USB Device.*(Descriptor|Enumeration)' -or
        $_.InstanceId -match '^USB\\VID_0000&PID_000[124]'
    })
$historicalFailures = @(Get-DeviceRecords -Devices $historicalFailureDevices)

$driverInfPath = Join-Path $env:windir 'INF\usbvideo.inf'
$driverInfText = if (Test-Path $driverInfPath) { Get-Content $driverInfPath -Raw } else { '' }
$driverPayload = Get-ChildItem (Join-Path $env:windir 'System32\DriverStore\FileRepository\usbvideo.inf_*') -Filter 'usbvideo.sys' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
$driverVersion = $null
if ($driverInfText -match '(?m)^DriverVer\s*=\s*[^,]+,([^\r\n]+)') {
    $driverVersion = $Matches[1].Trim()
}

$lowLevel = Get-LowLevelUsbStatus
$directShowDevices = @(Get-DirectShowVideoDevices)
$hasCurrentDescriptorFailure = $presentUsbProblems.Count -gt 0 -and [bool]($presentUsbProblems | Where-Object {
    $_.instanceId -match '^USB\\VID_0000&PID_000[124]' -or
    ($_.hardwareIds -join ';') -match 'DEVICE_DESCRIPTOR_FAILURE'
})

if ($usbCameras.Count -gt 0) {
    $diagnosisCode = 'ready'
    $diagnosisTitle = 'USB camera detected'
    $diagnosisSummary = 'Windows has enumerated an external USB camera. The controller can request its video stream.'
    $nextActions = @('Select the external camera in the controller and start the preview.')
} elseif ($hasCurrentDescriptorFailure -or $lowLevel.descriptorFailure) {
    $diagnosisCode = 'descriptor_failure'
    $diagnosisTitle = 'USB descriptor request failed'
    $diagnosisSummary = 'The hub detects an attachment, but Windows cannot read the camera descriptor. A driver cannot bind until the cable or adapter carries working USB data.'
    $nextActions = @(
        'Reseat the endoscope and test a known data-capable adapter or USB-A port.',
        'Avoid extension cables and passive charge-only adapters.',
        'Refresh diagnostics after reconnecting; a real VID and PID must appear before selecting a driver.'
    )
} elseif ($dockDevices.Count -gt 0) {
    $diagnosisCode = 'no_usb_data'
    $diagnosisTitle = 'No USB data connection from the endoscope'
    $diagnosisSummary = 'The Surface dock is online, but Windows sees neither an external camera nor a failed-enumeration node. The attached endoscope is not signaling on the USB data path.'
    $nextActions = @(
        'Connect the endoscope directly to a Surface dock USB-A port if its native plug is USB-A.',
        'If USB-C is required, use an adapter explicitly rated for USB data or OTG, not charging only.',
        'Try another known-good data port or computer before searching for a vendor driver.'
    )
} else {
    $diagnosisCode = 'no_camera'
    $diagnosisTitle = 'No external USB camera detected'
    $diagnosisSummary = 'Windows currently exposes only non-USB or built-in camera hardware.'
    $nextActions = @('Connect the endoscope to a known data-capable USB port, then refresh diagnostics.')
}

$result = [pscustomobject][ordered]@{
    schemaVersion = 1
    generatedAt = [datetime]::UtcNow.ToString('o')
    computerName = $env:COMPUTERNAME
    diagnosis = [pscustomobject][ordered]@{
        code = $diagnosisCode
        title = $diagnosisTitle
        summary = $diagnosisSummary
        nextActions = $nextActions
    }
    driver = [pscustomobject][ordered]@{
        name = 'Microsoft USB Video Class driver'
        inf = $driverInfPath
        service = 'usbvideo'
        version = $driverVersion
        payload = if ($null -eq $driverPayload) { $null } else { $driverPayload.FullName }
        classBinding = 'USB\CLASS_0E'
        ready = [bool]((Test-Path $driverInfPath) -and $null -ne $driverPayload -and $driverInfText -match 'USB\\CLASS_0E')
        recommendation = 'Use the Microsoft inbox UVC driver after the device enumerates as USB Video Class. Do not install a vendor driver without a verified VID and PID.'
    }
    cameras = [pscustomobject][ordered]@{
        externalUsb = $usbCameras
        allCameraClass = $cameraDevices
        directShow = $directShowDevices
    }
    usb = [pscustomobject][ordered]@{
        presentProblems = $presentUsbProblems
        historicalDescriptorFailures = $historicalFailures
        surfaceDockDevices = $dockDevices
        lowLevel = $lowLevel
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10 -Compress
} else {
    $result.diagnosis | Format-List
    $result.driver | Format-List
    $result.cameras.externalUsb | Format-Table name, status, vendorId, productId, service, instanceId -AutoSize
}