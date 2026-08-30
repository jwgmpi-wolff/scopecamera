import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/space-grotesk'
import {
  Aperture,
  Camera,
  Check,
  Circle,
  createElement,
  Expand,
  Focus,
  Lightbulb,
  Maximize2,
  MonitorUp,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  Square,
  Usb,
  Video,
  VideoOff,
  type IconNode,
} from 'lucide'
import './style.css'

type DiagnosisCode = 'ready' | 'descriptor_failure' | 'no_usb_data' | 'no_camera'

interface DeviceRecord {
  name: string
  status: string
  class: string
  instanceId: string
  vendorId: string | null
  productId: string | null
  service: string
  location: string
  problemCode: number
  present: boolean
  firstInstall: string
  lastArrival: string
}

interface UsbPortRecord {
  chain: string
  status: string
  connected: boolean
  device: string | null
}

interface HardwareStatus {
  generatedAt: string
  diagnosis: {
    code: DiagnosisCode
    title: string
    summary: string
    nextActions: string[]
  }
  driver: {
    name: string
    inf: string
    service: string
    version: string | null
    payload: string | null
    classBinding: string
    ready: boolean
    recommendation: string
  }
  cameras: {
    externalUsb: DeviceRecord[]
    allCameraClass: DeviceRecord[]
    directShow: string[]
  }
  usb: {
    presentProblems: DeviceRecord[]
    historicalDescriptorFailures: DeviceRecord[]
    surfaceDockDevices: DeviceRecord[]
    lowLevel: {
      available: boolean
      version: string | null
      descriptorFailure: boolean
      uvcDescriptor: boolean
      ports: UsbPortRecord[]
      error: string | null
    }
  }
}

interface NumericCapability {
  min: number
  max: number
  step: number
}

type NumericControlKey =
  | 'zoom'
  | 'focusDistance'
  | 'exposureCompensation'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'sharpness'
  | 'colorTemperature'

type CameraCapabilities = MediaTrackCapabilities &
  Partial<Record<NumericControlKey, NumericCapability>> & {
    torch?: boolean
    focusMode?: string[]
    exposureMode?: string[]
    whiteBalanceMode?: string[]
  }

type CameraSettings = MediaTrackSettings &
  Partial<Record<NumericControlKey, number>> & {
    torch?: boolean
    focusMode?: string
    exposureMode?: string
    whiteBalanceMode?: string
  }

function icon(iconNode: IconNode): string {
  return createElement(iconNode, { 'aria-hidden': 'true' }).outerHTML
}

const icons = {
  camera: icon(Camera),
  check: icon(Check),
  expand: icon(Expand),
  focus: icon(Focus),
  light: icon(Lightbulb),
  maximize: icon(Maximize2),
  monitor: icon(MonitorUp),
  pause: icon(Pause),
  play: icon(Play),
  record: icon(Circle),
  refresh: icon(RefreshCw),
  scan: icon(ScanLine),
  sliders: icon(SlidersHorizontal),
  snapshot: icon(Aperture),
  square: icon(Square),
  usb: icon(Usb),
  video: icon(Video),
  videoOff: icon(VideoOff),
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand" aria-label="Scope Console">
        <span class="brand-mark">${icons.scan}</span>
        <span><strong>SCOPE</strong> CONSOLE</span>
      </div>
      <div class="topbar-status">
        <span class="status-chip is-loading" id="connectionStatus">
          <span class="status-dot"></span>
          <span id="connectionLabel">Scanning USB path</span>
        </span>
        <button class="icon-button" id="refreshButton" type="button" title="Refresh devices and diagnostics" aria-label="Refresh devices and diagnostics">
          ${icons.refresh}
        </button>
      </div>
    </header>

    <main class="workspace">
      <section class="viewer-column" aria-label="Camera viewer">
        <div class="source-bar">
          <label class="device-select">
            <span>${icons.video}</span>
            <select id="deviceSelect" aria-label="Video source">
              <option value="">No camera sources</option>
            </select>
          </label>
          <button class="command-button" id="connectButton" type="button">
            <span class="button-icon">${icons.play}</span>
            <span id="connectLabel">Connect</span>
          </button>
        </div>

        <div class="viewport" id="viewport">
          <video id="cameraFeed" autoplay muted playsinline></video>
          <div class="reticle" id="reticle" aria-hidden="true" hidden>
            <span class="reticle-horizontal"></span>
            <span class="reticle-vertical"></span>
            <span class="reticle-ring"></span>
          </div>
          <div class="viewer-badges" id="viewerBadges" hidden>
            <span class="live-badge"><span></span> LIVE</span>
            <span class="recording-badge" id="recordingBadge" hidden><span></span> REC <b id="recordingTime">00:00</b></span>
          </div>
          <div class="empty-state" id="emptyState">
            <div class="diagnosis-mark is-loading" id="diagnosisMark">${icons.usb}</div>
            <p class="eyebrow" id="diagnosisEyebrow">WINDOWS USB DIAGNOSTIC</p>
            <h1 id="diagnosisTitle">Reading Surface dock ports</h1>
            <p id="diagnosisSummary">Checking enumeration, UVC binding, and DirectShow capture devices.</p>
            <div class="signal-row" aria-label="Diagnostic stages">
              <span id="signalDock"><i></i> Dock</span>
              <span id="signalUsb"><i></i> USB data</span>
              <span id="signalDriver"><i></i> UVC driver</span>
              <span id="signalStream"><i></i> Stream</span>
            </div>
          </div>
          <canvas id="captureCanvas" hidden></canvas>
        </div>

        <div class="transport">
          <div class="transport-actions">
            <button class="tool-button" id="snapshotButton" type="button" disabled title="Save snapshot">
              ${icons.snapshot}<span>Snapshot</span>
            </button>
            <button class="tool-button record-action" id="recordButton" type="button" disabled title="Record raw camera stream">
              ${icons.record}<span>Record</span>
            </button>
            <button class="icon-button" id="fullscreenButton" type="button" title="Fullscreen viewer" aria-label="Fullscreen viewer">
              ${icons.maximize}
            </button>
          </div>
          <div class="stream-metrics">
            <span id="resolutionMetric">-- x --</span>
            <span id="frameRateMetric">-- fps</span>
            <span id="formatMetric">UVC / DirectShow</span>
          </div>
        </div>
      </section>

      <aside class="control-panel" aria-label="Camera controls and diagnostics">
        <section class="panel-section controls-section">
          <div class="section-heading">
            <div>
              <span class="section-icon">${icons.sliders}</span>
              <h2>Camera controls</h2>
            </div>
            <button class="text-button" id="resetControlsButton" type="button" disabled>Reset</button>
          </div>
          <div class="control-list" id="cameraControls">
            <div class="panel-empty">
              <span>${icons.focus}</span>
              <p>Controls unavailable</p>
              <small>Waiting for a camera capability report.</small>
            </div>
          </div>
        </section>

        <section class="panel-section view-section">
          <div class="section-heading">
            <div>
              <span class="section-icon">${icons.expand}</span>
              <h2>View</h2>
            </div>
          </div>
          <div class="switch-row">
            <span>Mirror</span>
            <button class="switch" id="mirrorSwitch" type="button" role="switch" aria-checked="false"><span></span></button>
          </div>
          <div class="switch-row">
            <span>Reticle</span>
            <button class="switch is-on" id="reticleSwitch" type="button" role="switch" aria-checked="true"><span></span></button>
          </div>
          <div class="rotation-row">
            <span>Rotation</span>
            <div class="segmented" id="rotationControl" aria-label="Video rotation">
              <button class="is-active" type="button" data-rotation="0">0°</button>
              <button type="button" data-rotation="90">90°</button>
              <button type="button" data-rotation="180">180°</button>
              <button type="button" data-rotation="270">270°</button>
            </div>
          </div>
        </section>

        <section class="panel-section diagnostic-section">
          <div class="section-heading">
            <div>
              <span class="section-icon">${icons.usb}</span>
              <h2>Hardware path</h2>
            </div>
          </div>
          <dl class="fact-list">
            <div><dt>Surface dock</dt><dd id="dockFact">Scanning</dd></div>
            <div><dt>USB camera</dt><dd id="cameraFact">Scanning</dd></div>
            <div><dt>UVC driver</dt><dd id="driverFact">Scanning</dd></div>
            <div><dt>DirectShow</dt><dd id="directShowFact">Scanning</dd></div>
          </dl>
          <div class="diagnostic-note" id="diagnosticNote" hidden></div>
        </section>
      </aside>
    </main>

    <section class="evidence-band" aria-labelledby="evidenceTitle">
      <div class="evidence-heading">
        <p class="eyebrow">VERIFIED ON THIS SURFACE</p>
        <h2 id="evidenceTitle">Enumeration evidence</h2>
      </div>
      <div class="evidence-grid">
        <article>
          <span class="evidence-icon">${icons.usb}</span>
          <div><h3>Current USB path</h3><p id="usbEvidence">Collecting live hub status.</p></div>
        </article>
        <article>
          <span class="evidence-icon">${icons.check}</span>
          <div><h3>Driver binding</h3><p id="driverEvidence">Checking the Windows driver store.</p></div>
        </article>
        <article>
          <span class="evidence-icon">${icons.monitor}</span>
          <div><h3>Capture interface</h3><p id="captureEvidence">Enumerating DirectShow video inputs.</p></div>
        </article>
      </div>
    </section>
  </div>
`

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }
  return element
}

const video = requiredElement<HTMLVideoElement>('#cameraFeed')
const viewport = requiredElement<HTMLDivElement>('#viewport')
const emptyState = requiredElement<HTMLDivElement>('#emptyState')
const deviceSelect = requiredElement<HTMLSelectElement>('#deviceSelect')
const connectButton = requiredElement<HTMLButtonElement>('#connectButton')
const connectLabel = requiredElement<HTMLSpanElement>('#connectLabel')
const snapshotButton = requiredElement<HTMLButtonElement>('#snapshotButton')
const recordButton = requiredElement<HTMLButtonElement>('#recordButton')
const fullscreenButton = requiredElement<HTMLButtonElement>('#fullscreenButton')
const refreshButton = requiredElement<HTMLButtonElement>('#refreshButton')
const resetControlsButton = requiredElement<HTMLButtonElement>('#resetControlsButton')
const cameraControls = requiredElement<HTMLDivElement>('#cameraControls')
const mirrorSwitch = requiredElement<HTMLButtonElement>('#mirrorSwitch')
const reticleSwitch = requiredElement<HTMLButtonElement>('#reticleSwitch')
const reticle = requiredElement<HTMLDivElement>('#reticle')
const viewerBadges = requiredElement<HTMLDivElement>('#viewerBadges')
const recordingBadge = requiredElement<HTMLSpanElement>('#recordingBadge')
const recordingTime = requiredElement<HTMLElement>('#recordingTime')
const captureCanvas = requiredElement<HTMLCanvasElement>('#captureCanvas')

let stream: MediaStream | null = null
let videoTrack: MediaStreamTrack | null = null
let mediaRecorder: MediaRecorder | null = null
let hasRequestedCameraLabels = false
let recordedChunks: Blob[] = []
let recordStartedAt = 0
let recordTimer: number | null = null
let mirrored = false
let rotation = 0
let initialSettings: CameraSettings | null = null

const numericControls: Array<{
  key: NumericControlKey
  label: string
  format: (value: number) => string
}> = [
  { key: 'zoom', label: 'Zoom', format: (value) => `${value.toFixed(1)}x` },
  { key: 'focusDistance', label: 'Focus', format: (value) => value.toFixed(2) },
  { key: 'exposureCompensation', label: 'Exposure', format: (value) => value.toFixed(1) },
  { key: 'brightness', label: 'Brightness', format: (value) => Math.round(value).toString() },
  { key: 'contrast', label: 'Contrast', format: (value) => Math.round(value).toString() },
  { key: 'saturation', label: 'Saturation', format: (value) => Math.round(value).toString() },
  { key: 'sharpness', label: 'Sharpness', format: (value) => Math.round(value).toString() },
  { key: 'colorTemperature', label: 'White balance', format: (value) => `${Math.round(value)} K` },
]

function setText(selector: string, value: string): void {
  requiredElement<HTMLElement>(selector).textContent = value
}

function setSignal(selector: string, state: 'ok' | 'bad' | 'idle'): void {
  const element = requiredElement<HTMLElement>(selector)
  element.classList.toggle('is-ok', state === 'ok')
  element.classList.toggle('is-bad', state === 'bad')
}

function formatDate(value: string): string {
  if (!value) return 'unknown date'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

async function refreshDeviceList(): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    deviceSelect.innerHTML = '<option value="">MediaDevices unavailable</option>'
    deviceSelect.disabled = true
    return
  }

  const previousValue = deviceSelect.value
  let devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === 'videoinput',
  )

  // Browsers withhold real device labels (e.g. "Camera 1" instead of the
  // actual name) until camera permission is granted at least once.
  if (devices.length > 0 && devices.some((device) => !device.label) && !hasRequestedCameraLabels) {
    hasRequestedCameraLabels = true
    devices = await requestCameraLabels(devices)
  }

  deviceSelect.replaceChildren()

  if (devices.length === 0) {
    deviceSelect.add(new Option('No camera sources', ''))
    deviceSelect.disabled = true
    return
  }

  devices.forEach((device, index) => {
    deviceSelect.add(new Option(device.label || `Camera ${index + 1}`, device.deviceId))
  })
  deviceSelect.disabled = false

  const activeDeviceId = videoTrack?.getSettings().deviceId
  if (activeDeviceId && devices.some((device) => device.deviceId === activeDeviceId)) {
    deviceSelect.value = activeDeviceId
  } else if (devices.some((device) => device.deviceId === previousValue)) {
    deviceSelect.value = previousValue
  }
}

async function requestCameraLabels(fallback: MediaDeviceInfo[]): Promise<MediaDeviceInfo[]> {
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true })
    permissionStream.getTracks().forEach((track) => track.stop())
    return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput')
  } catch {
    return fallback
  }
}

function renderHardwareStatus(status: HardwareStatus): void {
  const diagnosis = status.diagnosis
  lastDiagnosisCode = diagnosis.code
  const diagnosisMark = requiredElement<HTMLElement>('#diagnosisMark')
  const connectionStatus = requiredElement<HTMLElement>('#connectionStatus')
  const externalCount = status.cameras.externalUsb.length
  const dockOnline = status.usb.surfaceDockDevices.length > 0
  const directShowNames = status.cameras.directShow
  const lowLevel = status.usb.lowLevel
  const dockPorts = lowLevel.ports
  const connectedPorts = dockPorts.filter((port) => port.connected).length

  setText('#diagnosisTitle', diagnosis.title)
  setText('#diagnosisSummary', diagnosis.summary)
  setText('#connectionLabel', diagnosis.code === 'ready' ? 'External camera ready' : diagnosis.title)
  connectionStatus.className = `status-chip is-${diagnosis.code}`
  diagnosisMark.className = `diagnosis-mark is-${diagnosis.code}`
  diagnosisMark.innerHTML = diagnosis.code === 'ready'
    ? icons.camera
    : diagnosis.code === 'descriptor_failure'
      ? icons.videoOff
      : icons.usb

  setSignal('#signalDock', dockOnline ? 'ok' : 'bad')
  setSignal('#signalUsb', externalCount > 0 ? 'ok' : diagnosis.code === 'descriptor_failure' ? 'bad' : 'idle')
  setSignal('#signalDriver', status.driver.ready ? 'ok' : 'bad')
  setSignal('#signalStream', stream ? 'ok' : 'idle')

  setText('#dockFact', dockOnline ? 'Online' : 'Not detected')
  setText('#cameraFact', externalCount > 0 ? `${externalCount} external` : 'Not enumerated')
  setText('#driverFact', status.driver.ready ? `${status.driver.version ?? 'installed'}` : 'Unavailable')
  setText('#directShowFact', directShowNames.length > 0 ? `${directShowNames.length} video input` : 'No video inputs')

  const diagnosticNote = requiredElement<HTMLDivElement>('#diagnosticNote')
  diagnosticNote.hidden = false
  diagnosticNote.textContent = diagnosis.nextActions[0] ?? diagnosis.summary

  const currentFailure = status.usb.presentProblems.length > 0 || lowLevel.descriptorFailure
  setText(
    '#usbEvidence',
    lowLevel.available
      ? `${dockPorts.length} dock port records: ${connectedPorts} connected. ${currentFailure ? 'A current USB failure is present.' : 'No current descriptor failure.'}`
      : `PnP found ${status.usb.surfaceDockDevices.length} dock-related devices; low-level port report unavailable.`,
  )
  setText(
    '#driverEvidence',
    status.driver.ready
      ? `Microsoft usbvideo ${status.driver.version ?? ''} is staged for ${status.driver.classBinding}.`
      : 'The Microsoft UVC class driver could not be verified in DriverStore.',
  )
  setText(
    '#captureEvidence',
    directShowNames.length > 0
      ? `DirectShow currently exposes: ${directShowNames.join(', ')}.`
      : 'DirectShow currently exposes no video capture device.',
  )

  if (status.usb.historicalDescriptorFailures.length > 0) {
    const historical = status.usb.historicalDescriptorFailures[0]
    diagnosticNote.textContent += ` Windows also retains one unidentified descriptor failure from ${formatDate(historical.firstInstall)}; it has no VID/PID and cannot be attributed to this endoscope.`
  }
}

async function refreshDiagnostics(): Promise<void> {
  refreshButton.classList.add('is-spinning')
  refreshButton.disabled = true
  try {
    const response = await fetch('/api/status', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Diagnostic service returned HTTP ${response.status}.`)
    }
    renderHardwareStatus((await response.json()) as HardwareStatus)
  } catch (error) {
    setText('#connectionLabel', 'Diagnostic unavailable')
    setText('#diagnosisTitle', 'Windows diagnostic unavailable')
    setText('#diagnosisSummary', error instanceof Error ? error.message : 'Unable to read hardware status.')
    requiredElement<HTMLElement>('#connectionStatus').className = 'status-chip is-no_camera'
  } finally {
    await refreshDeviceList().catch(() => undefined)
    refreshButton.classList.remove('is-spinning')
    refreshButton.disabled = false
  }
}

function updateStreamMetrics(): void {
  const settings = videoTrack?.getSettings()
  setText('#resolutionMetric', settings?.width && settings.height ? `${settings.width} x ${settings.height}` : '-- x --')
  setText('#frameRateMetric', settings?.frameRate ? `${Math.round(settings.frameRate)} fps` : '-- fps')
  setText('#formatMetric', videoTrack?.label || 'UVC / DirectShow')
}

function applyVideoTransform(): void {
  video.style.transform = `scaleX(${mirrored ? -1 : 1}) rotate(${rotation}deg)`
  video.classList.toggle('is-quarter-turned', rotation === 90 || rotation === 270)
}

function toggleSwitch(button: HTMLButtonElement, enabled: boolean): void {
  button.classList.toggle('is-on', enabled)
  button.setAttribute('aria-checked', enabled.toString())
}

async function applyAdvancedConstraint(constraint: Record<string, string | number | boolean>): Promise<void> {
  if (!videoTrack) return
  await videoTrack.applyConstraints({
    advanced: [constraint as unknown as MediaTrackConstraintSet],
  })
  updateStreamMetrics()
}

function createModeControl(
  key: 'focusMode' | 'exposureMode' | 'whiteBalanceMode',
  label: string,
  values: string[],
  currentValue: string | undefined,
): HTMLElement {
  const row = document.createElement('label')
  row.className = 'select-control'
  const title = document.createElement('span')
  title.textContent = label
  const select = document.createElement('select')
  select.setAttribute('aria-label', label)
  values.forEach((value) => select.add(new Option(value.replaceAll('-', ' '), value)))
  if (currentValue && values.includes(currentValue)) select.value = currentValue
  select.addEventListener('change', () => {
    void applyAdvancedConstraint({ [key]: select.value }).catch(showConstraintError)
  })
  row.append(title, select)
  return row
}

function showConstraintError(error: unknown): void {
  const note = requiredElement<HTMLDivElement>('#diagnosticNote')
  note.hidden = false
  note.textContent = error instanceof Error ? error.message : 'The camera rejected that control value.'
}

function renderCameraControls(): void {
  cameraControls.replaceChildren()
  if (!videoTrack) {
    cameraControls.innerHTML = `
      <div class="panel-empty"><span>${icons.focus}</span><p>Controls unavailable</p><small>Waiting for a camera capability report.</small></div>
    `
    resetControlsButton.disabled = true
    return
  }

  const capabilities = videoTrack.getCapabilities() as CameraCapabilities
  const settings = videoTrack.getSettings() as CameraSettings
  initialSettings = { ...settings }
  let controlCount = 0

  const modeControls: Array<{
    key: 'focusMode' | 'exposureMode' | 'whiteBalanceMode'
    label: string
  }> = [
    { key: 'focusMode', label: 'Focus mode' },
    { key: 'exposureMode', label: 'Exposure mode' },
    { key: 'whiteBalanceMode', label: 'White balance mode' },
  ]

  for (const mode of modeControls) {
    const values = capabilities[mode.key]
    if (Array.isArray(values) && values.length > 1) {
      cameraControls.append(createModeControl(mode.key, mode.label, values, settings[mode.key]))
      controlCount += 1
    }
  }

  for (const definition of numericControls) {
    const capability = capabilities[definition.key]
    if (!capability || typeof capability.min !== 'number' || capability.min === capability.max) continue

    const currentValue = settings[definition.key] ?? capability.min
    const row = document.createElement('label')
    row.className = 'range-control'
    const heading = document.createElement('span')
    heading.className = 'range-heading'
    const title = document.createElement('span')
    title.textContent = definition.label
    const output = document.createElement('output')
    output.textContent = definition.format(currentValue)
    heading.append(title, output)

    const input = document.createElement('input')
    input.type = 'range'
    input.min = capability.min.toString()
    input.max = capability.max.toString()
    input.step = (capability.step || (capability.max - capability.min) / 100).toString()
    input.value = currentValue.toString()
    input.setAttribute('aria-label', definition.label)
    input.addEventListener('input', () => {
      const value = Number(input.value)
      output.textContent = definition.format(value)
      void applyAdvancedConstraint({ [definition.key]: value }).catch(showConstraintError)
    })
    row.append(heading, input)
    cameraControls.append(row)
    controlCount += 1
  }

  if (capabilities.torch) {
    const row = document.createElement('div')
    row.className = 'switch-row camera-switch-row'
    const label = document.createElement('span')
    label.innerHTML = `<i>${icons.light}</i> Camera light`
    const button = document.createElement('button')
    button.className = 'switch'
    button.type = 'button'
    button.setAttribute('role', 'switch')
    button.setAttribute('aria-label', 'Camera light')
    button.setAttribute('aria-checked', 'false')
    button.innerHTML = '<span></span>'
    button.addEventListener('click', () => {
      const enabled = button.getAttribute('aria-checked') !== 'true'
      void applyAdvancedConstraint({ torch: enabled })
        .then(() => toggleSwitch(button, enabled))
        .catch(showConstraintError)
    })
    row.append(label, button)
    cameraControls.append(row)
    controlCount += 1
  }

  if (controlCount === 0) {
    cameraControls.innerHTML = `
      <div class="panel-empty"><span>${icons.sliders}</span><p>Fixed camera profile</p><small>This source reports no adjustable UVC controls.</small></div>
    `
  }
  resetControlsButton.disabled = controlCount === 0
}

function stopStream(): void {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  videoTrack = null
  video.srcObject = null
  emptyState.hidden = false
  viewerBadges.hidden = true
  reticle.hidden = true
  snapshotButton.disabled = true
  recordButton.disabled = true
  connectLabel.textContent = 'Connect'
  connectButton.querySelector<HTMLElement>('.button-icon')!.innerHTML = icons.play
  updateStreamMetrics()
  renderCameraControls()
  setSignal('#signalStream', 'idle')
}

async function startStream(): Promise<void> {
  stopStream()
  const selectedDeviceId = deviceSelect.value
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { width: { ideal: 1920 }, height: { ideal: 1080 } },
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints)
    videoTrack = stream.getVideoTracks()[0] ?? null
    if (!videoTrack) throw new Error('The selected source returned no video track.')
    video.srcObject = stream
    await video.play()
    await refreshDeviceList()
    emptyState.hidden = true
    viewerBadges.hidden = false
    reticle.hidden = reticleSwitch.getAttribute('aria-checked') !== 'true'
    snapshotButton.disabled = false
    recordButton.disabled = typeof MediaRecorder === 'undefined'
    connectLabel.textContent = 'Disconnect'
    connectButton.querySelector<HTMLElement>('.button-icon')!.innerHTML = icons.pause
    renderCameraControls()
    updateStreamMetrics()
    setSignal('#signalStream', 'ok')
  } catch (error) {
    stopStream()
    setText('#diagnosisTitle', 'Camera could not start')
    setText('#diagnosisSummary', error instanceof Error ? error.message : 'The browser rejected the camera request.')
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function captureSnapshot(): void {
  if (!video.videoWidth || !video.videoHeight) return
  const quarterTurn = rotation === 90 || rotation === 270
  captureCanvas.width = quarterTurn ? video.videoHeight : video.videoWidth
  captureCanvas.height = quarterTurn ? video.videoWidth : video.videoHeight
  const context = captureCanvas.getContext('2d')
  if (!context) return

  context.save()
  context.translate(captureCanvas.width / 2, captureCanvas.height / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.scale(mirrored ? -1 : 1, 1)
  context.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2)
  context.restore()
  captureCanvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `scope-${timestamp()}.png`)
  }, 'image/png')
}

function preferredRecordingType(): string {
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function updateRecordTimer(): void {
  const elapsed = Math.floor((Date.now() - recordStartedAt) / 1_000)
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const seconds = (elapsed % 60).toString().padStart(2, '0')
  recordingTime.textContent = `${minutes}:${seconds}`
}

function stopRecordingTimer(): void {
  if (recordTimer !== null) window.clearInterval(recordTimer)
  recordTimer = null
  recordingBadge.hidden = true
  recordButton.classList.remove('is-recording')
  recordButton.innerHTML = `${icons.record}<span>Record</span>`
}

function toggleRecording(): void {
  if (!stream || typeof MediaRecorder === 'undefined') return
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop()
    return
  }

  recordedChunks = []
  const mimeType = preferredRecordingType()
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data)
  })
  mediaRecorder.addEventListener('stop', () => {
    const type = mediaRecorder?.mimeType || 'video/webm'
    downloadBlob(new Blob(recordedChunks, { type }), `scope-${timestamp()}.webm`)
    stopRecordingTimer()
  })
  mediaRecorder.start(1_000)
  recordStartedAt = Date.now()
  updateRecordTimer()
  recordTimer = window.setInterval(updateRecordTimer, 1_000)
  recordingBadge.hidden = false
  recordButton.classList.add('is-recording')
  recordButton.innerHTML = `${icons.square}<span>Stop</span>`
}

async function resetCameraControls(): Promise<void> {
  if (!videoTrack || !initialSettings) return
  const restorableKeys = [
    'zoom',
    'focusDistance',
    'exposureCompensation',
    'brightness',
    'contrast',
    'saturation',
    'sharpness',
    'colorTemperature',
    'focusMode',
    'exposureMode',
    'whiteBalanceMode',
  ] as const

  for (const key of restorableKeys) {
    const value = initialSettings[key]
    if (value !== undefined) {
      await applyAdvancedConstraint({ [key]: value }).catch(() => undefined)
    }
  }
  renderCameraControls()
}

connectButton.addEventListener('click', () => {
  if (stream) stopStream()
  else void startStream()
})
deviceSelect.addEventListener('change', () => {
  if (stream) void startStream()
})
snapshotButton.addEventListener('click', captureSnapshot)
recordButton.addEventListener('click', toggleRecording)
refreshButton.addEventListener('click', () => void refreshDiagnostics())
resetControlsButton.addEventListener('click', () => void resetCameraControls())
fullscreenButton.addEventListener('click', () => void viewport.requestFullscreen())
mirrorSwitch.addEventListener('click', () => {
  mirrored = !mirrored
  toggleSwitch(mirrorSwitch, mirrored)
  applyVideoTransform()
})
reticleSwitch.addEventListener('click', () => {
  const visible = reticleSwitch.getAttribute('aria-checked') !== 'true'
  toggleSwitch(reticleSwitch, visible)
  reticle.hidden = !visible || !stream
})
requiredElement<HTMLDivElement>('#rotationControl').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-rotation]')
  if (!button) return
  rotation = Number(button.dataset.rotation)
  document.querySelectorAll('#rotationControl button').forEach((item) => item.classList.toggle('is-active', item === button))
  applyVideoTransform()
})
video.addEventListener('resize', updateStreamMetrics)
navigator.mediaDevices?.addEventListener('devicechange', () => {
  void refreshDeviceList()
  void refreshDiagnostics()
})
window.addEventListener('beforeunload', stopStream)

applyVideoTransform()
void refreshDiagnostics()

let isPolling = false
let lastDiagnosisCode: DiagnosisCode | null = null

window.setInterval(() => {
  if (isPolling || lastDiagnosisCode === 'ready') return
  isPolling = true
  void refreshDiagnostics().finally(() => {
    isPolling = false
  })
}, 4000)