# Scope Console

Scope Console is a local Windows endoscope viewer and evidence-based USB diagnostic. It operates standards-compliant USB Video Class (UVC) cameras through the browser's MediaDevices API and reports the Windows PnP, driver, DirectShow, and Surface dock state beside the video.

## Verified Finding

Observed on `WOLFFSURFACEPC` on August 21, 2026:

- The Microsoft Surface Thunderbolt 4 Dock and its USB 2/USB 3 hub paths are online.
- USBTreeView 4.7.3 returned 28 live records below the dock. Every exposed port was either occupied by a known device or reported `No device is connected`.
- Windows has no present external USB Camera/Image device, no present `usbvideo` service node, and no current failed USB node.
- DirectShow exposes only `Surface Camera Front` as a video input.
- Windows retains one historical `USB\VID_0000&PID_0002` descriptor failure from May 26, 2026 below a Genesys Logic hub. Because Windows never read a descriptor, that record has no real VID/PID and cannot be attributed to this endoscope.
- The ARM64 Microsoft UVC package is staged in DriverStore. `usbvideo.inf` version `10.0.26100.8972` binds `USB\CLASS_0E` to `usbvideo.sys`.

**Conclusion:** the attached endoscope is not currently signaling on the dock's USB data path. This is earlier than driver matching. There is no defensible vendor driver to install until Windows reads the device descriptor and supplies a real VID/PID. For a compliant endoscope, the correct driver is already present: Microsoft's inbox UVC driver.

## Run

Prerequisites:

- Windows 11 and PowerShell 7 (`pwsh`)
- Node.js 20 or newer
- FFmpeg in `PATH` for DirectShow name enumeration (optional)
- USB Device Tree Viewer for low-level dock port evidence (optional; installed through `winget` as `UweSieber.UsbTreeView`)

Start the development console:

```powershell
cd C:\Users\jerrywolff\Documents\.git\scopecamera
.\Start-ScopeCamera.ps1
```

Or run the built preview:

```powershell
.\Start-ScopeCamera.ps1 -Mode Production
```

The development URL is `http://127.0.0.1:5173`; production preview uses `http://127.0.0.1:4173`. The server binds only to loopback.

## Reconnect Test

1. If the endoscope has a native USB-A plug, connect it directly to a dock USB-A data port without the USB-C adapter.
2. If an adapter is required, use one explicitly rated for USB data/OTG. A charge-only adapter can power LEDs while leaving D+/D- disconnected.
3. Avoid extension cables for the first enumeration test.
4. Press the refresh icon in Scope Console or run `npm run diagnose`.
5. Do not select or install a vendor driver until the report shows a real `USB\VID_xxxx&PID_xxxx` identifier.

Once Windows exposes the camera, select it in Scope Console and press **Connect**. Snapshot, WebM recording, fullscreen, mirror, rotation, and reticle are always available during a stream. Zoom, focus, exposure, white balance, brightness, contrast, saturation, sharpness, and camera light appear only when the camera reports those capabilities. The app does not claim unsupported controls.

## Validation

```powershell
npm test
npm run build
npm audit --omit=dev
```

`npm test` verifies the diagnostic schema and checks that the diagnosis is consistent with its underlying device evidence. It is state-aware, so it remains valid after a camera is connected.

## Architecture And Privacy

- Vite serves the UI and a loopback-only `/api/status` middleware.
- The middleware runs `scripts/Get-ScopeCameraStatus.ps1` with fixed arguments. The diagnostic is read-only.
- Video remains in the browser. Snapshots and recordings are downloaded locally; no media is uploaded.
- The diagnostic does not install, replace, restart, or disable any driver or USB device.

## Sources

- Microsoft, [USB Video Class Driver Overview](https://learn.microsoft.com/windows-hardware/drivers/stream/usb-video-class-driver-overview): UVC devices use the system-provided `Usbvideo.sys`; compliant devices do not require a vendor driver.
- Microsoft, [USB Device Descriptors](https://learn.microsoft.com/windows-hardware/drivers/usbcon/usb-device-descriptors): Windows obtains `idVendor` and `idProduct` from the device descriptor and constructs the hardware ID used for driver matching.
- Uwe Sieber, [USB Device Tree Viewer](https://www.uwe-sieber.de/usbtreeview_e.html): documents hub-port status and the `VID_0000&PID_0001/0002/0004` signature when a device does not answer the descriptor request.