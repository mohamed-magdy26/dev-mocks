import { parse } from '@babel/parser'

export const PACKAGE_NAME = '@dsquares/dev-mocks'

export interface AstNode {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: { line: number } } | null
  [key: string]: unknown
}

export interface RenderStatement {
  start: number
  end: number
  line: number
}

/** A `.ts` file may contain `<Type>value` casts, which the JSX plugin rejects, so JSX is on only for other files. */
export function parseSource(code: string, fileName = 'file.tsx'): AstNode {
  return parse(code, {
    sourceType: 'module',
    plugins: /\.[cm]?ts$/.test(fileName) ? ['typescript'] : ['typescript', 'jsx'],
    createImportExpressions: true,
  }) as unknown as AstNode
}

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

function walk(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit)
    return
  }
  if (!isNode(value)) return
  visit(value)
  for (const child of Object.values(value)) walk(child, visit)
}

function isIdentifier(value: unknown, name?: string): value is AstNode {
  return isNode(value) && value.type === 'Identifier' && (name === undefined || value.name === name)
}

function isCreateRootCall(value: unknown): boolean {
  if (!isNode(value) || value.type !== 'CallExpression') return false
  const callee = value.callee
  return (
    isIdentifier(callee, 'createRoot') ||
    (isNode(callee) && callee.type === 'MemberExpression' && isIdentifier(callee.property, 'createRoot'))
  )
}

/** Finds `createRoot(el).render(...)` statements, and `root.render(...)` where `root` holds a createRoot result. */
export function findRenderStatements(ast: AstNode): RenderStatement[] {
  const rootNames = new Set<string>()
  walk(ast, (node) => {
    const id = node.id
    if (node.type === 'VariableDeclarator' && isIdentifier(id) && isCreateRootCall(node.init)) {
      rootNames.add(String(id.name))
    }
  })

  const statements: RenderStatement[] = []
  walk(ast, (node) => {
    if (node.type !== 'ExpressionStatement') return
    const call = node.expression
    if (!isNode(call) || call.type !== 'CallExpression') return
    const callee = call.callee
    if (!isNode(callee) || callee.type !== 'MemberExpression' || !isIdentifier(callee.property, 'render')) return
    const target = callee.object
    if (isCreateRootCall(target) || (isIdentifier(target) && rootNames.has(String(target.name)))) {
      statements.push({ start: node.start ?? 0, end: node.end ?? 0, line: node.loc?.start.line ?? 0 })
    }
  })
  return statements
}

/** Lists relative paths from static imports and dynamic import() calls, in source order. */
export function listRelativeImports(ast: AstNode): string[] {
  const sources: string[] = []
  walk(ast, (node) => {
    if (node.type !== 'ImportDeclaration' && node.type !== 'ImportExpression') return
    const source = node.source
    if (isNode(source) && source.type === 'StringLiteral' && typeof source.value === 'string' && source.value.startsWith('.')) {
      sources.push(source.value)
    }
  })
  return sources
}

const DEFAULT_UNIT = '  '

/**
 * One step of indentation as this file writes it. A file with any tab-indented code line uses a tab;
 * otherwise the smallest run of leading spaces on a code line wins, which is 2 or 4 in real files. A
 * file with no indented line at all gets two spaces, because something has to be picked.
 *
 * Only code lines are measured. The continuation line of a block comment starts with one space before
 * its `*`, so measuring it would make the unit one space in any file holding a JSDoc comment. A tab
 * typed inside a template string would likewise turn a space-indented file into a tab-indented one.
 */
export function indentUnit(code: string, ast: AstNode): string {
  const skip = notCodeLines(code, ast)
  let smallest = 0
  let at = 0
  for (const line of code.split('\n')) {
    const here = at
    at += line.length + 1
    if (skip.has(here)) continue
    if (/^\t/.test(line)) return '\t'
    const spaces = /^( +)\S/.exec(line)
    if (!spaces) continue
    const width = spaces[1].length
    if (smallest === 0 || width < smallest) smallest = width
  }
  return smallest === 0 ? DEFAULT_UNIT : ' '.repeat(smallest)
}

function indentLine(line: string, index: number, indent: string, unit: string): string {
  if (index === 0) return `${indent}${unit}${line}`
  // A blank line in a CRLF file is "\r" rather than "", and indenting it would leave trailing spaces.
  return line.trim() === '' ? line : `${unit}${line}`
}

/**
 * Offsets of the lines that sit inside a multi-line template string (text between backticks) in the
 * render call. Indenting one of those lines would add spaces to the text the app prints, so they are
 * skipped. The first line of a template string is not in here: it carries the opening backtick, so
 * it is part of the code and moves with it.
 */
function insideTemplateLines(ast: AstNode, from: number, to: number, code: string): Set<number> {
  const lines = new Set<number>()
  walk(ast, (node) => {
    if (node.type !== 'TemplateLiteral') return
    const start = node.start ?? 0
    const end = node.end ?? 0
    if (start < from || end > to) return
    addLinesAfterFirst(lines, code, start, end)
  })
  return lines
}

/** Records the offset of every line of `code` between `start` and `end`, except the first one. */
function addLinesAfterFirst(lines: Set<number>, code: string, start: number, end: number): void {
  const text = code.slice(start, end)
  let offset = text.indexOf('\n')
  while (offset !== -1) {
    lines.add(start + offset + 1)
    offset = text.indexOf('\n', offset + 1)
  }
}

/**
 * Offsets of every line in the file that is not code: the second line onwards of a multi-line template
 * string, and the second line onwards of a block comment. The first line of each one stays in, because
 * it starts where the code starts and so carries the file's real indentation.
 */
function notCodeLines(code: string, ast: AstNode): Set<number> {
  const lines = insideTemplateLines(ast, 0, code.length, code)
  const comments = (ast.comments as AstNode[] | undefined) ?? []
  for (const comment of comments) addLinesAfterFirst(lines, code, comment.start ?? 0, comment.end ?? 0)
  return lines
}

/** Adds the startDevMocks import after the last import, and wraps the render statement in startDevMocks().then(...). */
export function wrapRender(code: string, ast: AstNode, statement: RenderStatement): string {
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  const program = ast.program as AstNode
  const imports = (program.body as AstNode[]).filter((node) => node.type === 'ImportDeclaration')
  const firstSource = imports[0]?.source as AstNode | undefined
  const quote = typeof firstSource?.start === 'number' ? code[firstSource.start] : "'"
  const lastImportEnd = imports.at(-1)?.end ?? 0
  const semicolon = imports.length === 0 || code[lastImportEnd - 1] === ';' ? ';' : ''
  const importLine = `import { startDevMocks } from ${quote}${PACKAGE_NAME}${quote}${semicolon}`

  const lineStart = code.lastIndexOf('\n', statement.start - 1) + 1
  const before = code.slice(lineStart, statement.start)
  const indent = /^[ \t]*$/.test(before) ? before : ''
  const unit = indentUnit(code, ast)
  const original = code.slice(statement.start, statement.end)
  const skip = insideTemplateLines(ast, statement.start, statement.end, code)
  // `at` walks the offset of each line in the whole file, so a line can be checked against `skip`.
  let at = statement.start
  const body = original
    // Split on "\n", not on `eol`, so the offsets stay right in a file that mixes CRLF and LF lines.
    .split('\n')
    .map((line, index) => {
      const here = at
      at += line.length + 1
      return skip.has(here) ? line : indentLine(line, index, indent, unit)
    })
    .join('\n')
  const closing = original.endsWith(';') ? '});' : '})'
  const wrapped = `startDevMocks().then(() => {${eol}${body}${eol}${indent}${closing}`

  const edits = [
    { start: statement.start, end: statement.end, text: wrapped },
    {
      start: lastImportEnd,
      end: lastImportEnd,
      text: imports.length > 0 ? `${eol}${importLine}` : `${importLine}${eol}`,
    },
  ].sort((a, b) => b.start - a.start)
  return edits.reduce((result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end), code)
}
