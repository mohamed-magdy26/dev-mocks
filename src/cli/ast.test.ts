import { describe, expect, it } from 'vitest'
import { findRenderStatements, listRelativeImports, parseSource, wrapRender } from './ast.js'

const lf = (lines: string[]) => lines.join('\n')
const crlf = (lines: string[]) => lines.join('\r\n')

function wrap(code: string): string {
  const ast = parseSource(code)
  const [statement] = findRenderStatements(ast)
  return wrapRender(code, ast, statement)
}

describe('wrapRender', () => {
  it('wraps a chained createRoot(...).render(...) call', () => {
    const input = lf([
      "import React from 'react';",
      "import ReactDOM from 'react-dom/client';",
      "import App from './App';",
      "import './index.css';",
      '',
      "const rootElement = document.getElementById('root');",
      '',
      'ReactDOM.createRoot(rootElement!).render(',
      '  <React.StrictMode>',
      '    <App />',
      '  </React.StrictMode>',
      ');',
      '',
    ])
    expect(wrap(input)).toBe(
      lf([
        "import React from 'react';",
        "import ReactDOM from 'react-dom/client';",
        "import App from './App';",
        "import './index.css';",
        "import { startDevMocks } from '@dsquares/dev-mocks';",
        '',
        "const rootElement = document.getElementById('root');",
        '',
        'startDevMocks().then(() => {',
        '  ReactDOM.createRoot(rootElement!).render(',
        '    <React.StrictMode>',
        '      <App />',
        '    </React.StrictMode>',
        '  );',
        '});',
        '',
      ]),
    )
  })

  it('wraps root.render(...) and keeps CRLF line endings and double quotes', () => {
    const input = crlf([
      'import React from "react";',
      'import ReactDOM from "react-dom/client";',
      'import App from "./App";',
      'import reportWebVitals from "./reportWebVitals";',
      '',
      'const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);',
      'root.render(',
      '  <React.StrictMode>',
      '    <App isStandalone />',
      '  </React.StrictMode>,',
      ');',
      '',
      'reportWebVitals();',
      '',
    ])
    expect(wrap(input)).toBe(
      crlf([
        'import React from "react";',
        'import ReactDOM from "react-dom/client";',
        'import App from "./App";',
        'import reportWebVitals from "./reportWebVitals";',
        'import { startDevMocks } from "@dsquares/dev-mocks";',
        '',
        'const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);',
        'startDevMocks().then(() => {',
        '  root.render(',
        '    <React.StrictMode>',
        '      <App isStandalone />',
        '    </React.StrictMode>,',
        '  );',
        '});',
        '',
        'reportWebVitals();',
        '',
      ]),
    )
  })

  it('wraps a render call inside an if block, in a file without semicolons', () => {
    const input = lf([
      'import ReactDOM from "react-dom/client"',
      'import App from "./App"',
      '',
      'const rootEl = document.getElementById("root")',
      'if (rootEl) {',
      '  const root = ReactDOM.createRoot(rootEl)',
      '  root.render(<App />)',
      '}',
      '',
    ])
    expect(wrap(input)).toBe(
      lf([
        'import ReactDOM from "react-dom/client"',
        'import App from "./App"',
        'import { startDevMocks } from "@dsquares/dev-mocks"',
        '',
        'const rootEl = document.getElementById("root")',
        'if (rootEl) {',
        '  const root = ReactDOM.createRoot(rootEl)',
        '  startDevMocks().then(() => {',
        '    root.render(<App />)',
        '  })',
        '}',
        '',
      ]),
    )
  })
})

describe('findRenderStatements', () => {
  it('finds a render call on a named createRoot import', () => {
    const ast = parseSource(
      lf([
        'import { createRoot } from "react-dom/client";',
        'import App from "./App.tsx";',
        '',
        'createRoot(document.getElementById("root")!).render(<App />);',
      ]),
    )
    expect(findRenderStatements(ast).map((statement) => statement.line)).toEqual([4])
  })

  it('ignores the React 17 ReactDOM.render(...) call', () => {
    const ast = parseSource(lf(['import ReactDOM from "react-dom";', 'ReactDOM.render(<App />, document.getElementById("root"));']))
    expect(findRenderStatements(ast)).toEqual([])
  })

  it('returns every render call when a file has two roots', () => {
    const ast = parseSource(
      lf([
        'import ReactDOM from "react-dom/client";',
        'const app = ReactDOM.createRoot(document.getElementById("app")!);',
        'const modal = ReactDOM.createRoot(document.getElementById("modal")!);',
        'app.render(<App />);',
        'modal.render(<Modal />);',
      ]),
    )
    expect(findRenderStatements(ast).map((statement) => statement.line)).toEqual([4, 5])
  })
})

describe('listRelativeImports', () => {
  it('returns the side-effect import of a bootstrap file', () => {
    expect(listRelativeImports(parseSource('import "./bootstrap";\n'))).toEqual(['./bootstrap'])
  })

  it('returns static and dynamic relative imports in order and skips packages', () => {
    const ast = parseSource(
      lf([
        'import React from "react";',
        'import { loadAppConfig } from "./app.config";',
        '',
        'loadAppConfig()',
        '  .catch(() => {})',
        '  .finally(() => import("./bootstrap"));',
      ]),
    )
    expect(listRelativeImports(ast)).toEqual(['./app.config', './bootstrap'])
  })
})

describe('parseSource', () => {
  it('parses an angle-bracket cast in a .ts file', () => {
    const code = 'const el = <HTMLElement>document.getElementById("root");\n'
    expect(() => parseSource(code, 'src/main.ts')).not.toThrow()
  })
})
