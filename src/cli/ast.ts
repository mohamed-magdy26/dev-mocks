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

function indentLine(line: string, index: number, indent: string): string {
  if (index === 0) return `${indent}  ${line}`
  return line === '' ? line : `  ${line}`
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
  const original = code.slice(statement.start, statement.end)
  const body = original
    .split(eol)
    .map((line, index) => indentLine(line, index, indent))
    .join(eol)
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
