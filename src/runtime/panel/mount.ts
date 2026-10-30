import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { errorController } from '../controller.js'
import DevMocksPanel from './DevMocksPanel.js'
import { hiddenNotice, HIDDEN_KEY, ON_FLAG, readSetting, type Shortcut } from './settings.js'
import { css } from './styles.generated.js'

const HOST_ID = 'dev-mocks-host'
const FONTS_ID = 'dev-mocks-fonts'
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap'

export function mountPanel(shortcut: Shortcut): void {
  if (document.getElementById(HOST_ID)) return

  const notice = hiddenNotice(
    {
      hidden: readSetting(HIDDEN_KEY) === ON_FLAG,
      paused: errorController.isPaused(),
      count: errorController.getAllConfigs().length,
    },
    shortcut,
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
  createRoot(container).render(createElement(DevMocksPanel, { shortcut }))
}
