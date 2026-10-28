import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findEntry, findRenderFiles } from './entry.js'

let cwd: string

function project(files: Record<string, string>): string {
  cwd = mkdtempSync(join(tmpdir(), 'dev-mocks-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }
  return cwd
}

afterEach(() => rmSync(cwd, { recursive: true, force: true }))

const vite = { devDependencies: { vite: '^5.0.0' } }
const rsbuild = { devDependencies: { '@rsbuild/core': '^1.0.0' } }

describe('findEntry', () => {
  it('reads the module script from index.html in a Vite project', () => {
    const dir = project({
      'index.html': '<body><script type="module" src="/src/main.tsx"></script></body>',
      'src/main.tsx': '',
    })
    expect(findEntry(dir, vite)).toBe('src/main.tsx')
  })

  it('accepts src before type and a ./ prefix', () => {
    const dir = project({ 'index.html': '<script src="./src/app.tsx" type="module"></script>', 'src/app.tsx': '' })
    expect(findEntry(dir, vite)).toBe('src/app.tsx')
  })

  it('skips an inline module script that has no src', () => {
    const dir = project({
      'index.html': '<script type="module">window.global = window</script>\n<script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx': '',
    })
    expect(findEntry(dir, vite)).toBe('src/main.tsx')
  })

  it('reads source.entry from rsbuild.config.ts', () => {
    const dir = project({
      'rsbuild.config.ts': "export default { source: { entry: { index: './src/main.tsx' } } }",
      'src/main.tsx': '',
    })
    expect(findEntry(dir, rsbuild)).toBe('src/main.tsx')
  })

  it("falls back to Rsbuild's default src/index.tsx", () => {
    const dir = project({ 'rsbuild.config.ts': 'export default {}', 'src/index.tsx': '' })
    expect(findEntry(dir, rsbuild)).toBe('src/index.tsx')
  })

  it('returns undefined when no candidate file exists', () => {
    const dir = project({ 'rsbuild.config.ts': 'export default {}' })
    expect(findEntry(dir, rsbuild)).toBeUndefined()
  })
})

const BOOTSTRAP = 'import ReactDOM from "react-dom/client";\nconst root = ReactDOM.createRoot(document.body);\nroot.render(<div />);\n'
const TOAST =
  'import { createRoot } from "react-dom/client";\nexport function showToast() {\n  createRoot(document.body).render(<p />);\n}\n'

describe('findRenderFiles', () => {
  it('follows the entry import to bootstrap.tsx and skips the CSS import', () => {
    const dir = project({
      'src/index.tsx': 'import "./index.css";\nimport "./bootstrap";\n',
      'src/index.css': 'body { margin: 0 }',
      'src/bootstrap.tsx': BOOTSTRAP,
    })
    const targets = findRenderFiles(dir, 'src/index.tsx')
    expect(targets.map((target) => target.file)).toEqual(['src/bootstrap.tsx'])
    expect(targets[0]?.statements).toHaveLength(1)
  })

  it('returns only the entry when the entry renders by itself', () => {
    const dir = project({
      'src/main.tsx': 'import "./toast";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.body).render(<div />);\n',
      'src/toast.tsx': TOAST,
    })
    expect(findRenderFiles(dir, 'src/main.tsx').map((target) => target.file)).toEqual(['src/main.tsx'])
  })

  it('returns every imported file that renders, so init can refuse to guess', () => {
    const dir = project({
      'src/index.tsx': 'import "./lib/toast";\nimport "./bootstrap";\n',
      'src/lib/toast.tsx': TOAST,
      'src/bootstrap.tsx': BOOTSTRAP,
    })
    expect(findRenderFiles(dir, 'src/index.tsx').map((target) => target.file)).toEqual([
      'src/lib/toast.tsx',
      'src/bootstrap.tsx',
    ])
  })
})
