import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const fromSource = process.env.DEV_MOCKS_FROM === 'source'

const ORDERS = [
  { id: 1, customer: 'Lina Haddad', total: 42.5, status: 'paid' },
  { id: 2, customer: 'Omar Farouk', total: 18, status: 'pending' },
  { id: 3, customer: 'Sara Nabil', total: 125.75, status: 'paid' },
  { id: 4, customer: 'Youssef Adel', total: 9.99, status: 'refunded' },
  { id: 5, customer: 'Mona Saleh', total: 64.2, status: 'pending' },
]

/** Answers /api/orders and /api/orders/:id on the dev server, so the panel has real requests to mock or let through. */
function fakeApi(): Plugin {
  return {
    name: 'fake-api',
    configureServer(server) {
      server.middlewares.use('/api/orders', (req, res) => {
        // The 300 ms wait makes the loading state and the "Delay only" card visible.
        setTimeout(() => {
          const id = req.url?.split('?')[0].replace(/^\//, '')
          const body = id ? ORDERS.find((order) => String(order.id) === id) : ORDERS
          res.statusCode = body ? 200 : 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body ?? { message: 'Order not found' }))
        }, 300)
      })
    },
  }
}

const RENDER_CALL = "createRoot(document.getElementById('root')!).render("

/** Does in memory what `npx dev-mocks init` does on disk: wraps the render call of main.tsx in startDevMocks(). */
function wrapForSource(): Plugin {
  return {
    name: 'wrap-for-source',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/example/src/main.tsx')) return undefined
      const start = code.indexOf(RENDER_CALL)
      if (start === -1) throw new Error(`wrap-for-source: main.tsx no longer contains ${RENDER_CALL}`)
      const render = code.slice(start).trimEnd()
      return `${code.slice(0, start)}import { startDevMocks } from '@dsquares/dev-mocks'\nstartDevMocks().then(() => {\n  ${render}\n})\n`
    },
  }
}

/** Rebuilds the panel CSS when a panel file changes, so a new Tailwind class works without a restart. */
function rebuildPanelCss(): Plugin {
  return {
    name: 'rebuild-panel-css',
    handleHotUpdate({ file }) {
      if (file.includes('/src/runtime/panel/') && !file.endsWith('styles.generated.ts')) {
        execFileSync(process.execPath, ['scripts/build-css.mjs'], { cwd: repoRoot, stdio: 'inherit' })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), fakeApi(), ...(fromSource ? [wrapForSource(), rebuildPanelCss()] : [])],
  resolve: {
    alias: fromSource ? { '@dsquares/dev-mocks': `${repoRoot}src/index.ts` } : {},
    // Do not remove: without it, src/ loads the repo root's React and msw, and the worker file's msw version differs.
    dedupe: ['react', 'react-dom', 'msw'],
  },
  server: {
    port: fromSource ? 5173 : 5174,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
})
