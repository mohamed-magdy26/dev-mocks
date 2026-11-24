// Starts example/ in one of two modes:
//   source  the app imports the package from src/ (port 5173)
//   packed  the app runs in .example-packed/ with the packed .tgz installed and `npx dev-mocks init` applied (port 5174)
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const mode = process.argv[2]
if (mode !== 'source' && mode !== 'packed') {
  console.error('Usage: node scripts/example.mjs <source|packed>')
  process.exit(1)
}

function run(command, cwd, env = {}) {
  console.log(`$ ${command}   (in ${cwd})`)
  // npm run passes .npmrc's allow-scripts to children as npm_config_allow_scripts, and npm 11 refuses that
  // variable in a project install (EALLOWSCRIPTS). src/cli/index.ts drops it for the same reason.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_config_allow_scripts'),
  )
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true, env: { ...inherited, ...env } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const example = join(root, 'example')
if (mode === 'source') {
  if (!existsSync(join(example, 'node_modules'))) run('npm install', example)
  run('npm run build:css', root)
  // --no-save: without it, msw asks a yes/no question and waits for an answer.
  run('npx msw init public --no-save', example)
  run('npx vite', example, { DEV_MOCKS_FROM: 'source' })
} else {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  run('npm pack', root)
  const copy = join(root, '.example-packed')
  // Keeps node_modules between runs so each run installs only the new .tgz.
  for (const name of ['src', 'public', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json']) {
    rmSync(join(copy, name), { recursive: true, force: true })
  }
  cpSync(example, copy, {
    recursive: true,
    filter: (source) => !source.includes('node_modules') && !source.endsWith('mockServiceWorker.js'),
  })
  run(`npm install -D "${join(root, `dsquares-dev-mocks-${version}.tgz`)}"`, copy)
  run('npx dev-mocks init', copy)
  // --force: Vite caches the pre-bundled package, and would otherwise serve the previous .tgz.
  run('npx vite --force', copy)
}
