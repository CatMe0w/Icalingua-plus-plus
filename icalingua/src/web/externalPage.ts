/**
 * 桌面版在子窗口中直接打开 QQ 的网页（登录时的滑块验证码、设备锁验证），并向页面注入脚本。
 * 浏览器既不能把其他网站嵌进来操作，也不能向其注入脚本，网页版改为在窗口里显示说明面板：
 * 用户点击按钮在新标签页打开该页面，完成后通过以下方式把结果带回来：
 *
 * - 滑块验证码：验证页把结果写进 jsbridge://CAPTCHA/onVerifyCAPTCHA?p=... 地址（桌面版的 sliderinj.js 截获它）。
 *   网页版可以手动粘贴这个地址，或安装用户脚本 icalingua-login-helper.user.js 自动发回。
 * - 设备锁验证：在新标签页完成验证后关闭本窗口，与桌面版关闭验证窗口一样触发重新登录。
 *   桌面版注入的设备信息由用户脚本（如已安装）写入页面。
 */
import { ipcRenderer } from './ipcBus'

export type ExternalPageKind = 'slider' | 'verify' | 'generic'

interface ExternalPageWindow {
    close(): void
    /** 桌面版通过 executeJavaScript 注入的脚本，设备锁验证页的设备信息从中取出 */
    injectedScripts: string[]
}

const USERSCRIPT_URL = 'static/icalingua-login-helper.user.js'

/** 解析桌面版 sliderinj.js 截获的地址，也接受直接粘贴的 "ticket,randstr" */
export const parseSliderTicket = (input: string): string | null => {
    const text = input.trim()
    const prefix = 'jsbridge://CAPTCHA/onVerifyCAPTCHA?p='
    if (text.startsWith(prefix)) {
        const json = text.substring(prefix.length)
        // 与 sliderinj.js 一样：地址末尾可能带有多余字符，逐步截短直到能解析
        for (let i = json.length; i > 0; i--) {
            try {
                const obj = JSON.parse(decodeURIComponent(json.substring(0, i)))
                if (obj.ticket) return obj.ticket + ',' + obj.randstr
            } catch {
                // 继续截短
            }
        }
        return null
    }
    return /^[^\s,]+,[^\s,]+$/.test(text) ? text : null
}

/** 从桌面版注入的 `window.__INITIAL_STATE__.deviceInfo = {...};` 中取出设备信息（只传数据，不传代码） */
const extractDeviceInfo = (scripts: string[]) => {
    for (const script of scripts) {
        const match = script.match(/^window\.__INITIAL_STATE__\.deviceInfo = ([\s\S]*);$/)
        if (match)
            try {
                return JSON.parse(match[1])
            } catch {
                return null
            }
    }
    return null
}

/** 滑块验证窗口由桌面版带 sliderPreload.js 创建；设备锁验证窗口会注入设备信息 */
export const detectExternalPageKind = (options: Record<string, any>, injectedScripts: string[]): ExternalPageKind => {
    if (String(options.webPreferences?.preload || '').endsWith('sliderPreload.js')) return 'slider'
    if (extractDeviceInfo(injectedScripts)) return 'verify'
    return 'generic'
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}) =>
    Object.assign(document.createElement(tag), props)

/** 生成说明面板，并在打开的标签页与本页之间传递验证结果 */
export const createExternalPagePanel = (url: string, kind: ExternalPageKind, win: ExternalPageWindow) => {
    const root = el('div', { className: 'web-external-page' })
    const status = el('p', { className: 'web-external-status' })
    let opened: Window | null = null

    const title = {
        slider: '需要完成滑块验证',
        verify: '需要完成设备锁验证',
        generic: '此页面需要在新标签页中打开',
    }[kind]
    root.append(el('h3', { textContent: title }))
    if (kind === 'generic')
        root.append(
            el('p', {
                textContent: '网页版无法直接嵌入此页面。完成操作后关闭本窗口即可。',
                className: 'web-external-url',
            }),
        )
    if (kind === 'slider')
        root.append(
            el('p', {
                textContent:
                    '点击下方按钮在新标签页打开验证页并完成验证。安装了登录辅助用户脚本时，验证结果会自动发回；' +
                    '否则请在验证页按 F12 打开开发者工具的 "网络" 面板，找到以 jsbridge:// 开头的失败请求，复制其地址粘贴到下方。',
            }),
        )
    if (kind === 'verify')
        root.append(
            el('p', {
                textContent: '点击下方按钮在新标签页打开验证页，按提示完成验证后，关闭本窗口即可重新登录。',
            }),
        )

    const openButton = el('button', { textContent: '在新标签页打开', className: 'web-external-primary' })
    // 必须在点击事件中直接打开，否则会被浏览器的弹窗拦截
    openButton.addEventListener('click', () => {
        // 保留 opener，用户脚本通过它把验证结果发回本页
        opened = window.open(url, '_blank')
        status.textContent = opened
            ? '已在新标签页打开，请在其中完成操作'
            : '新标签页被浏览器拦截，请允许本站打开弹出窗口'
    })
    const actions = el('div', { className: 'web-external-actions' })
    actions.append(openButton)
    if (kind !== 'generic')
        actions.append(el('a', { href: USERSCRIPT_URL, target: '_blank', textContent: '安装登录辅助用户脚本' }))
    root.append(actions)

    const submitTicket = (ticket: string) => {
        ipcRenderer.send('sliderLogin', ticket)
        opened?.close()
        win.close()
    }

    if (kind === 'slider') {
        const input = el('textarea', {
            className: 'web-external-input',
            placeholder: 'jsbridge://CAPTCHA/onVerifyCAPTCHA?p=...',
            rows: 3,
        })
        const submit = el('button', { textContent: '提交' })
        submit.addEventListener('click', () => {
            const ticket = parseSliderTicket(input.value)
            if (ticket) submitTicket(ticket)
            else status.textContent = '无法识别，请粘贴完整的 jsbridge:// 地址'
        })
        root.append(input, submit)
    }
    root.append(status)

    // 用户脚本的消息：只接受来自本窗口打开的标签页
    const onMessage = (e: MessageEvent) => {
        if (!opened || e.source !== opened || typeof e.data !== 'object' || !e.data) return
        if (kind === 'slider' && e.data.type === 'icalingua:sliderTicket') {
            const ticket = parseSliderTicket(String(e.data.ticket || ''))
            if (ticket) submitTicket(ticket)
        }
        if (kind === 'verify' && e.data.type === 'icalingua:hello') {
            const deviceInfo = extractDeviceInfo(win.injectedScripts)
            if (deviceInfo) opened.postMessage({ type: 'icalingua:deviceInfo', deviceInfo }, e.origin)
        }
    }
    window.addEventListener('message', onMessage)
    return { root, dispose: () => window.removeEventListener('message', onMessage) }
}
