#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { PACKAGE_NAME, parseSource, wrapRender } from './ast.js'
import { findEntry, findRenderFiles, hasDependency, SOURCE_EXTENSIONS, type PackageJson } from './entry.js'

const HELP = `Usage: npx dev-mocks init [--entry <file>] [--public-dir <dir>]

Sets up the dev-mocks panel in the repo in the current folder:
  1. installs msw if it is missing, and writes the MSW worker file into the public folder
  2. wraps your createRoot(...).render(...) call in startDevMocks().then(...)

Options:
  --entry <file>       the entry file to start from, when detection picks the wrong one
  --public-dir <dir>   the folder your dev server serves as-is (default: public)`

const MANUAL_STEPS = `Add these lines yourself, in the file that calls createRoot(...).render(...):

  import { startDevMocks } from '${PACKAGE_NAME}'

  startDevMocks().then(() => {
    // move your existing createRoot(...).render(...) call in here
  })`

function run(command: string, cwd: string): boolean {
  console.log(`$ ${command}`)
  // npx hands the user's .npmrc settings to children as npm_config_* variables. npm 11 reads
  // npm_config_allow_scripts as the --allow-scripts flag and refuses it in a project install
  // (EALLOWSCRIPTS), so the child must read that setting from .npmrc itself.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_config_allow_scripts'),
  )
  return spawnSync(command, { cwd, stdio: 'inherit', shell: true, env }).status === 0
}

function installMswCommand(cwd: string): string {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm add -D "msw@^2"'
  if (existsSync(join(cwd, 'yarn.lock')) && !existsSync(join(cwd, 'package-lock.json'))) return 'yarn add -D "msw@^2"'
  return 'npm install -D "msw@^2"'
}

function findExistingMswSetup(cwd: string): string | undefined {
  const srcDir = join(cwd, 'src')
  if (!existsSync(srcDir)) return undefined
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext)))
    .map((file) => `src/${file.replaceAll('\\', '/')}`)
    .find((file) => readFileSync(join(cwd, file), 'utf8').includes('msw/browser'))
}

function init(cwd: string, entryOption: string | undefined, publicDir: string): void {
  if (!/^[\w./-]+$/.test(publicDir)) {
    throw new Error(`--public-dir may only contain letters, digits, ".", "/", "_" and "-". Got: ${publicDir}`)
  }

  const packageJsonPath = join(cwd, 'package.json')
  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json in ${cwd}. Run this command at the repo root.`)
  }
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson

  const existingMsw = findExistingMswSetup(cwd)
  if (existingMsw) {
    throw new Error(
      `This repo already starts its own MSW worker in ${existingMsw}. ` +
        'dev-mocks would start a second worker on the same page. Remove the existing MSW setup first, then run init again.',
    )
  }

  const entry = entryOption ?? findEntry(cwd, pkg)
  if (!entry || !existsSync(join(cwd, entry))) {
    throw new Error('Could not find the entry file. Rerun with --entry, for example: npx dev-mocks init --entry src/index.tsx')
  }
  console.log(`✔ entry: ${entry}`)

  const targets = findRenderFiles(cwd, entry)
  if (targets.length === 0) {
    throw new Error(`Could not find createRoot(...).render(...) in ${entry} or in the files it imports.\n\n${MANUAL_STEPS}`)
  }
  if (targets.length > 1) {
    const files = targets.map((candidate) => candidate.file).join(', ')
    throw new Error(
      `Found render calls in ${targets.length} files (${files}), so init cannot tell which one renders your app.\n\n${MANUAL_STEPS}`,
    )
  }
  const [target] = targets
  if (target.statements.length > 1) {
    const lines = target.statements.map((statement) => statement.line).join(', ')
    throw new Error(
      `Found ${target.statements.length} render calls in ${target.file} (lines ${lines}), so init cannot tell which one renders your app.\n\n${MANUAL_STEPS}`,
    )
  }

  if (!hasDependency(pkg, 'msw') && !run(installMswCommand(cwd), cwd)) {
    throw new Error('Installing msw failed. Read the output above.')
  }
  if (!run(`npx msw init ${publicDir} --save`, cwd)) {
    throw new Error('msw init failed. Read the output above.')
  }
  console.log(`✔ MSW worker file written to ${publicDir}/mockServiceWorker.js`)

  const [statement] = target.statements
  const renderPath = join(cwd, target.file)
  const code = readFileSync(renderPath, 'utf8')
  if (code.includes(PACKAGE_NAME)) {
    console.log(`✔ ${target.file} already calls startDevMocks()`)
  } else {
    writeFileSync(renderPath, wrapRender(code, parseSource(code, target.file), statement))
    console.log(`✔ wrapped the render call in ${target.file}:${statement.line}`)
  }

  console.log('\nDone. Start your dev server. A ⚙️ button appears at the bottom right of the page.')
}

function main(): void {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        entry: { type: 'string' },
        'public-dir': { type: 'string', default: 'public' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    if (values.help) {
      console.log(HELP)
      return
    }
    if (positionals[0] !== 'init') {
      console.log(HELP)
      process.exitCode = 1
      return
    }
    init(process.cwd(), values.entry, values['public-dir'] ?? 'public')
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

main()
