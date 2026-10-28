import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { findRenderStatements, listRelativeImports, parseSource, type RenderStatement } from './ast.js'

export interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface RenderTarget {
  file: string
  statements: RenderStatement[]
}

export const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

const RSBUILD_CONFIGS = ['rsbuild.config.ts', 'rsbuild.config.mts', 'rsbuild.config.js', 'rsbuild.config.mjs', 'rsbuild.config.cjs']

export function hasDependency(pkg: PackageJson, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name])
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

function isSourceFile(cwd: string, path: string): boolean {
  const full = join(cwd, path)
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext)) && existsSync(full) && statSync(full).isFile()
}

/** Returns the entry file path relative to `cwd`, or undefined when no candidate file exists. */
export function findEntry(cwd: string, pkg: PackageJson): string | undefined {
  const candidates: string[] = []

  if (hasDependency(pkg, 'vite')) {
    const html = readIfExists(join(cwd, 'index.html')) ?? ''
    const src = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*>/g)]
      .map((tag) => tag[0].match(/\bsrc=["']([^"']+)["']/)?.[1])
      .find((value) => value !== undefined)
    if (src) candidates.push(src.replace(/^\.?\//, ''))
  }

  if (hasDependency(pkg, '@rsbuild/core')) {
    const config = RSBUILD_CONFIGS.map((name) => readIfExists(join(cwd, name))).find((text) => text !== undefined)
    const entry = config?.match(/\bentry\s*:\s*\{[^}]*?["'`]([^"'`]+\.[cm]?[jt]sx?)["'`]/)?.[1]
    if (entry) candidates.push(entry.replace(/^\.\//, ''))
    candidates.push(...SOURCE_EXTENSIONS.map((ext) => `src/index${ext}`))
  }

  return candidates.find((path) => isSourceFile(cwd, path))
}

function resolveImport(cwd: string, fromFile: string, specifier: string): string | undefined {
  const base = join(dirname(fromFile), specifier)
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ]
  return candidates.find((path) => isSourceFile(cwd, path))?.replaceAll('\\', '/')
}

function readRenderStatements(cwd: string, file: string): RenderStatement[] {
  try {
    return findRenderStatements(parseSource(readFileSync(join(cwd, file), 'utf8'), file))
  } catch {
    return []
  }
}

/** Returns the entry alone when it renders. Otherwise returns every file the entry imports with a relative path that renders. */
export function findRenderFiles(cwd: string, entry: string): RenderTarget[] {
  const entryAst = parseSource(readFileSync(join(cwd, entry), 'utf8'), entry)
  const direct = findRenderStatements(entryAst)
  if (direct.length > 0) return [{ file: entry, statements: direct }]

  const targets: RenderTarget[] = []
  for (const specifier of listRelativeImports(entryAst)) {
    const file = resolveImport(cwd, entry, specifier)
    if (!file) continue
    const statements = readRenderStatements(cwd, file)
    if (statements.length > 0) targets.push({ file, statements })
  }
  return targets
}
