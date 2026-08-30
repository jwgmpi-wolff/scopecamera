import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))
const diagnosticScript = path.join(rootDirectory, 'scripts', 'Get-ScopeCameraStatus.ps1')

let activeDiagnostic: Promise<string> | null = null

function readHardwareStatus(): Promise<string> {
  if (activeDiagnostic) {
    return activeDiagnostic
  }

  activeDiagnostic = new Promise((resolve, reject) => {
    execFile(
      'pwsh.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        diagnosticScript,
        '-Json',
      ],
      {
        cwd: rootDirectory,
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024,
        timeout: 45_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }

        const payload = stdout.trim()
        try {
          JSON.parse(payload)
          resolve(payload)
        } catch {
          reject(new Error('The Windows diagnostic returned invalid JSON.'))
        }
      },
    )
  }).finally(() => {
    activeDiagnostic = null
  })

  return activeDiagnostic
}

function diagnosticMiddleware(): Connect.NextHandleFunction {
  return async (request, response, next) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (requestUrl.pathname !== '/api/status') {
      next()
      return
    }

    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' })
      response.end()
      return
    }

    try {
      const payload = await readHardwareStatus()
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      })
      response.end(payload)
    } catch (error) {
      response.writeHead(500, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      })
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Diagnostic failed.',
        }),
      )
    }
  }
}

function hardwareDiagnosticPlugin(): Plugin {
  return {
    name: 'scope-camera-hardware-diagnostic',
    configureServer(server) {
      server.middlewares.use(diagnosticMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(diagnosticMiddleware())
    },
  }
}

export default defineConfig({
  plugins: [hardwareDiagnosticPlugin()],
})