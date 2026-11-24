import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { errorController } from '../controller.js'
import DevMocksPanel from './DevMocksPanel.js'
import { PanelCrash } from './PanelCrash.js'
import { ON_FLAG, readSetting, shrunkNotice, SHRUNK_KEY, type Shortcut } from './settings.js'
import { css } from './styles.generated.js'

const HOST_ID = 'dev-mocks-host'
const FONTS_ID = 'dev-mocks-fonts'
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap'

/**
 * The React root this copy of the module created. A dev server that hot-swaps this file hands the
 * page a fresh copy whose variable is undefined, which is how `mountPanel` tells "already mounted,
 * by me" from "a host element left behind by a copy of this module that no longer renders".
 */
let root: Root | undefined

/** `shortcut` opens and closes the panel. `shrinkShortcut` shrinks the ⚙️ tab to the edge and back. */
export interface Keys {
  shortcut: Shortcut
  shrinkShortcut: Shortcut
}

function panel(keys: Keys) {
  // Wrapped, so a render error inside the panel shows the message instead of leaving a blank shadow root.
  return createElement(PanelCrash, null, createElement(DevMocksPanel, keys))
}

export function mountPanel(keys: Keys): void {
  const existing = document.getElementById(HOST_ID)
  if (existing && root) {
    // Mounted by this same copy of the module, so rendering again is all that is needed.
    root.render(panel(keys))
    return
  }
  // A host with no root of ours belongs to a copy of this module the dev server has replaced. Its
  // React root still points at the old container and will never render again, so the panel would
  // stay an empty box in the shadow root's dark background. Removing it starts the panel over.
  existing?.remove()

  // Our own root from an earlier call now renders into a container no longer in the page, because the
  // line above removed its host, or the host app did. Unmounting it runs the panel's cleanup, so its
  // keyboard listener and its subscription to the rule store stop before the new root adds its own.
  root?.unmount()
  root = undefined

  const notice = shrunkNotice(
    {
      shrunk: readSetting(SHRUNK_KEY) === ON_FLAG,
      paused: errorController.isPaused(),
      count: errorController.getAllConfigs().length,
    },
    keys.shrinkShortcut,
  )
  if (notice) console.info(notice)

  // A font declared inside a shadow root never loads, so the font stylesheet goes into the page's <head>.
  if (!document.getElementById(FONTS_ID)) {
    const fonts = document.createElement('link')
    fonts.id = FONTS_ID
    fonts.rel = 'stylesheet'
    fonts.href = FONTS_URL
    document.head.appendChild(fonts)
  }

  const host = document.createElement('div')
  host.id = HOST_ID
  document.body.appendChild(host)

  // The shadow root keeps the host app's global CSS (for example Tailwind's reset) away from the panel.
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  const container = document.createElement('div')
  shadow.append(style, container)
  root = createRoot(container)
  root.render(panel(keys))
}
