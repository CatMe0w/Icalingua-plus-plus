/**
 * 网页版的 "窗口"。主窗口就是当前页面；子窗口是页面里可拖动、可缩放的浮动面板，
 * 内含一个加载本页面对应路由的 iframe（见 ipcBus.ts 中的子窗口模式）。
 *
 * 实现主进程代码会用到的 BrowserWindow / webContents 方法；未实现的方法调用时什么也不做，
 * 这样 windowManager、menuManager 等复用的代码可以照常创建和操作窗口。
 */
import { MAIN_WINDOW_ID, sendToRendererWindow, setPointerHandler, setWebContentsResolver } from './ipcBus'
import { closeContextMenu, pointerScreenOffset, trackPointer } from './shims/electronMenu'

type Callback = (...args: any[]) => void

class Emitter {
    private listeners = new Map<string, Set<Callback>>()
    on(event: string, cb: Callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set())
        this.listeners.get(event).add(cb)
        return this
    }
    once(event: string, cb: Callback) {
        const wrapped = (...args: any[]) => {
            this.removeListener(event, wrapped)
            cb(...args)
        }
        return this.on(event, wrapped)
    }
    removeListener(event: string, cb: Callback) {
        this.listeners.get(event)?.delete(cb)
        return this
    }
    emit(event: string, ...args: any[]) {
        for (const cb of [...(this.listeners.get(event) ?? [])]) {
            try {
                cb(...args)
            } catch (e) {
                console.error(`[web] 窗口事件 ${event} 处理出错`, e)
            }
        }
    }
}

const noop = () => {}

/** 未实现的方法统一返回空操作，避免复用的主进程代码调用到不存在的方法而报错 */
const absorbUnknown = <T extends object>(target: T): T =>
    new Proxy(target, {
        get: (obj, prop) => (prop in obj || typeof prop === 'symbol' ? obj[prop] : noop),
    })

class WebContents extends Emitter {
    constructor(readonly window: WebWindow) {
        super()
    }
    get id() {
        return this.window.id
    }
    send(channel: string, ...args: any[]) {
        sendToRendererWindow(this.window.id, channel, args)
    }
    isDestroyed() {
        return this.window.isDestroyed()
    }
    executeJavaScript() {
        return Promise.resolve(undefined)
    }
    getURL() {
        return this.window.url
    }
}

const windows = new Map<number, WebWindow>()
let nextWindowId = MAIN_WINDOW_ID + 1
let topZIndex = 2000

export class WebWindow extends Emitter {
    readonly webContents: WebContents
    url = ''
    private destroyed = false
    private title: string
    private panel: HTMLElement | null = null
    private titleEl: HTMLElement | null = null

    constructor(
        readonly id: number,
        private readonly options: Record<string, any> = {},
    ) {
        super()
        // 对外一律使用包了一层的对象，使未实现的方法也能安全调用
        const self = absorbUnknown(this)
        this.webContents = absorbUnknown(new WebContents(self))
        this.title = options.title ?? ''
        windows.set(id, self)
        return self
    }

    get isMain() {
        return this.id === MAIN_WINDOW_ID
    }

    /**
     * 打开本应用的某个路由（#/xxx）。外部网址默认在新标签页打开；
     * 创建窗口时指定 embedExternal 则直接嵌入面板（如 bridge 的群文件页面）。
     */
    loadURL(url: string) {
        this.url = url
        const hash = url.includes('#') ? url.slice(url.indexOf('#')) : ''
        if (this.isMain) return Promise.resolve()
        const isAppRoute = !!hash && url.startsWith(location.href.split('#')[0])
        if (!isAppRoute && !this.options.embedExternal) {
            window.open(url, '_blank', 'noopener')
            this.close()
            return Promise.resolve()
        }
        return new Promise<void>((resolve) => {
            const iframe = this.createPanel(isAppRoute)
            iframe.addEventListener(
                'load',
                () => {
                    if (!this.title) this.setTitle(iframe.contentDocument?.title || '')
                    this.webContents.emit('did-finish-load')
                    this.emit('ready-to-show')
                    resolve()
                },
                { once: true },
            )
            iframe.src = isAppRoute ? location.pathname + location.search + hash : url
        })
    }

    /** 面板里的页面，用于和嵌入的外部页面 postMessage 通信 */
    getFrameWindow(): Window | null {
        return this.panel?.querySelector('iframe')?.contentWindow ?? null
    }

    private createPanel(isAppRoute: boolean) {
        ensureStyle()
        const width = Math.min(this.options.width || 800, window.innerWidth - 32)
        const height = Math.min(this.options.height || 600, window.innerHeight - 32)
        const offset = (windows.size % 6) * 24
        const panel = document.createElement('div')
        panel.className = 'web-window'
        panel.style.width = width + 'px'
        panel.style.height = height + 'px'
        panel.style.left = Math.max(16, (window.innerWidth - width) / 2 + offset) + 'px'
        panel.style.top = Math.max(16, (window.innerHeight - height) / 2 + offset) + 'px'

        const header = document.createElement('div')
        header.className = 'web-window-header'
        this.titleEl = document.createElement('span')
        this.titleEl.className = 'web-window-title'
        this.titleEl.textContent = this.title
        const close = document.createElement('button')
        close.className = 'web-window-close'
        close.title = '关闭'
        close.textContent = '×'
        close.addEventListener('click', () => this.close())
        header.append(this.titleEl, close)

        const iframe = document.createElement('iframe')
        // 只有本应用的页面才作为子窗口接入 IPC 总线
        if (isAppRoute) iframe.dataset.icalinguaWindow = String(this.id)
        panel.append(header, iframe)
        document.body.appendChild(panel)
        this.panel = panel

        panel.addEventListener('mousedown', () => this.focus(), true)
        enableDrag(panel, header)
        this.focus()
        return iframe
    }

    setTitle(title: string) {
        this.title = title
        if (this.titleEl) this.titleEl.textContent = title
        if (this.isMain) document.title = title
    }
    getTitle() {
        return this.isMain ? document.title : this.title
    }

    focus() {
        if (this.panel) this.panel.style.zIndex = String(++topZIndex)
        else window.focus()
        this.emit('focus')
    }
    show() {
        if (this.panel) this.panel.style.display = ''
        this.focus()
    }
    hide() {
        if (this.panel) this.panel.style.display = 'none'
    }
    isVisible() {
        if (this.isMain) return document.visibilityState === 'visible'
        return !!this.panel && this.panel.style.display !== 'none'
    }
    isFocused() {
        if (this.isMain) return document.hasFocus() && !document.activeElement?.closest?.('.web-window')
        return !!this.panel && this.panel.contains(document.activeElement)
    }
    isMinimized() {
        return false
    }
    isDestroyed() {
        return this.destroyed
    }

    close() {
        if (this.destroyed || this.isMain) return
        this.emit('close', { preventDefault: noop })
        this.destroy()
    }
    destroy() {
        if (this.destroyed || this.isMain) return
        this.destroyed = true
        this.panel?.remove()
        this.panel = null
        windows.delete(this.id)
        this.emit('closed')
    }

    /** 右键菜单渲染在顶层页面，所有窗口都以顶层页面可视区域在屏幕上的位置为准 */
    getContentBounds() {
        return {
            x: pointerScreenOffset.x,
            y: pointerScreenOffset.y,
            width: window.innerWidth,
            height: window.innerHeight,
        }
    }
    getBounds() {
        const rect = this.panel?.getBoundingClientRect()
        return rect
            ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
            : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
    }
    getNormalBounds() {
        return this.getBounds()
    }
    getSize() {
        const { width, height } = this.getBounds()
        return [width, height]
    }
    getPosition() {
        const { x, y } = this.getBounds()
        return [x, y]
    }
}

/** 主窗口：当前页面 */
export const mainWindow = new WebWindow(MAIN_WINDOW_ID)

/** 对应 newIcalinguaWindow / new BrowserWindow */
export const createWindow = (options?: Record<string, any>) => new WebWindow(nextWindowId++, options)

export const getWindowByWebContents = (webContents: { window?: WebWindow } | null) => webContents?.window ?? mainWindow

setWebContentsResolver((id) => (windows.get(id) ?? mainWindow).webContents)
setPointerHandler((e) => {
    trackPointer(e)
    // 子窗口内的点击不会触发顶层页面的 mousedown，在这里关闭已打开的菜单
    closeContextMenu()
})

// region 面板样式与拖动
const STYLE = `
.web-window { position: fixed; display: flex; flex-direction: column; min-width: 320px; min-height: 200px;
    background: #fff; border: 1px solid #dcdfe6; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, .2);
    overflow: hidden; resize: both; }
.web-window-header { display: flex; align-items: center; height: 32px; padding: 0 4px 0 12px; flex: none;
    background: #f5f7fa; border-bottom: 1px solid #ebeef5; cursor: move; user-select: none; font-size: 13px; color: #303133; }
.web-window-title { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.web-window-close { width: 28px; height: 28px; border: 0; border-radius: 4px; background: none; color: inherit;
    font-size: 18px; line-height: 1; cursor: pointer; }
.web-window-close:hover { background: #f56c6c; color: #fff; }
.web-window iframe { flex: 1; width: 100%; border: 0; }
.web-window-dragging iframe { pointer-events: none; }
@media (prefers-color-scheme: dark) {
    .web-window { background: #131415; border-color: #444; }
    .web-window-header { background: #2b2b2b; border-color: #444; color: #e5e5e5; }
}`

const ensureStyle = () => {
    if (document.getElementById('web-window-style')) return
    const style = document.createElement('style')
    style.id = 'web-window-style'
    style.textContent = STYLE
    document.head.appendChild(style)
}

const enableDrag = (panel: HTMLElement, handle: HTMLElement) => {
    handle.addEventListener('mousedown', (e) => {
        if ((e.target as Element).closest('button')) return
        e.preventDefault()
        const startX = e.clientX - panel.offsetLeft
        const startY = e.clientY - panel.offsetTop
        // 拖动时 iframe 会吞掉鼠标事件，暂时让所有面板的 iframe 不响应鼠标
        document.body.classList.add('web-window-dragging')
        const move = (ev: MouseEvent) => {
            const x = Math.min(Math.max(ev.clientX - startX, 40 - panel.offsetWidth), window.innerWidth - 40)
            const y = Math.min(Math.max(ev.clientY - startY, 0), window.innerHeight - 32)
            panel.style.left = x + 'px'
            panel.style.top = y + 'px'
        }
        const up = () => {
            document.body.classList.remove('web-window-dragging')
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
    })
}
// endregion
