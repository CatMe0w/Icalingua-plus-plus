/**
 * 浏览器内的 IPC 总线，模拟 Electron 的 ipcMain / ipcRenderer。
 *
 * 顶层页面扮演 "主进程" 和主窗口；每个子窗口是一个 iframe（见 webWindow.ts），
 * 与 Electron 一样是独立的 "渲染进程"，通过顶层页面上的 host 对象收发消息。
 * 跨窗口传递的数据会在接收方复制一份（对应 Electron IPC 的结构化克隆），避免共享对象和跨 realm 的原型问题。
 */

type Listener = (event: any, ...args: any[]) => void
type Handler = (event: any, ...args: any[]) => any

/** 主窗口的编号；子窗口从 1 开始 */
export const MAIN_WINDOW_ID = 0

interface Host {
    connect(windowId: number, deliver: (channel: string, args: any[]) => void): void
    disconnect(windowId: number): void
    send(windowId: number, channel: string, args: any[]): void
    invoke(windowId: number, channel: string, args: any[]): Promise<any>
    /** 子窗口中的鼠标事件，换算成顶层页面坐标后转交给右键菜单 */
    pointer(e: { clientX: number; clientY: number; screenX: number; screenY: number }): void
}

const clone = <T>(value: T): T => {
    try {
        return structuredClone(value)
    } catch {
        try {
            return JSON.parse(JSON.stringify(value))
        } catch {
            return value
        }
    }
}

const warned = new Set<string>()
const warnOnce = (kind: string, channel: string) => {
    const key = kind + ':' + channel
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`[web] 未实现的 IPC ${kind}: ${channel}`)
}

const frameWindowId = (() => {
    try {
        const id = (window.frameElement as HTMLElement | null)?.dataset?.icalinguaWindow
        return id !== undefined && (window.top as any).__icalinguaHost ? Number(id) : null
    } catch {
        return null
    }
})()

/** 当前页面是否是子窗口（iframe） */
export const isSubWindow = frameWindowId !== null
const windowId = frameWindowId ?? MAIN_WINDOW_ID

// region 主进程（只在顶层页面使用）
const mainOnHandlers = new Map<string, Set<Handler>>()
const mainInvokeHandlers = new Map<string, Handler>()
const ports = new Map<number, (channel: string, args: any[]) => void>()
/** 由 webWindow.ts 设置：按编号取得窗口的 webContents，作为 event.sender */
let getWebContents: (windowId: number) => any = () => null
let onPointer: Host['pointer'] = () => {}

export const setWebContentsResolver = (resolver: typeof getWebContents) => (getWebContents = resolver)
export const setPointerHandler = (handler: Host['pointer']) => (onPointer = handler)

const host: Host = {
    connect: (id, deliver) => ports.set(id, deliver),
    disconnect: (id) => ports.delete(id),
    send(id, channel, args) {
        const handlers = mainOnHandlers.get(channel)
        if (!handlers) return warnOnce('send', channel)
        if (id !== MAIN_WINDOW_ID) args = clone(args)
        const event = { sender: getWebContents(id) }
        // Electron 的 send 是异步的，这里也放到微任务里，避免渲染进程代码依赖同步副作用
        queueMicrotask(() => {
            for (const handler of handlers) {
                try {
                    const result = handler(event, ...args)
                    if (result instanceof Promise) result.catch((e) => console.error(`[web] 处理 ${channel} 时出错`, e))
                } catch (e) {
                    console.error(`[web] 处理 ${channel} 时出错`, e)
                }
            }
        })
    },
    async invoke(id, channel, args) {
        const handler = mainInvokeHandlers.get(channel)
        if (!handler) {
            warnOnce('invoke', channel)
            return undefined
        }
        if (id !== MAIN_WINDOW_ID) args = clone(args)
        return await handler({ sender: getWebContents(id) }, ...args)
    },
    pointer: (e) => onPointer(e),
}

if (!isSubWindow) (window as any).__icalinguaHost = host

export const ipcMain = {
    // 与 Electron 一样，同一通道可以有多个监听器（如 ui.ts 与 windowManager 都监听 setSelectedRoom）
    on(channel: string, handler: Handler) {
        if (!mainOnHandlers.has(channel)) mainOnHandlers.set(channel, new Set())
        mainOnHandlers.get(channel).add(handler)
    },
    once(channel: string, handler: Handler) {
        const wrapped: Handler = (event, ...args) => {
            mainOnHandlers.get(channel)?.delete(wrapped)
            return handler(event, ...args)
        }
        ipcMain.on(channel, wrapped)
    },
    removeListener(channel: string, handler: Handler) {
        mainOnHandlers.get(channel)?.delete(handler)
    },
    handle(channel: string, handler: Handler) {
        mainInvokeHandlers.set(channel, handler)
    },
    removeHandler(channel: string) {
        mainInvokeHandlers.delete(channel)
    },
}

/** 主进程向某个窗口发送消息，对应 webContents.send */
export const sendToRendererWindow = (id: number, channel: string, args: any[]) => ports.get(id)?.(channel, args)

/** 主进程向主窗口发送消息 */
export const emitToRenderer = (channel: string, ...args: any[]) => sendToRendererWindow(MAIN_WINDOW_ID, channel, args)
// endregion

// region 渲染进程（每个页面各一个）
const hostOfThisPage: Host = isSubWindow ? (window.top as any).__icalinguaHost : host
const rendererListeners = new Map<string, Set<Listener>>()
const rendererEvent = { sender: null as any }

hostOfThisPage.connect(windowId, (channel, args) => {
    const listeners = rendererListeners.get(channel)
    if (!listeners) return
    if (isSubWindow) args = clone(args)
    for (const listener of [...listeners]) {
        try {
            listener(rendererEvent, ...args)
        } catch (e) {
            console.error(`[web] 处理 ${channel} 时出错`, e)
        }
    }
})

if (isSubWindow) {
    window.addEventListener('pagehide', () => hostOfThisPage.disconnect(windowId))
    // 子窗口里的鼠标事件不会冒泡到顶层页面，转交给顶层页面的右键菜单，用于定位和关闭菜单
    const forwardPointer = (e: MouseEvent) => {
        const rect = window.frameElement.getBoundingClientRect()
        hostOfThisPage.pointer({
            clientX: rect.left + e.clientX,
            clientY: rect.top + e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
        })
    }
    window.addEventListener('mousedown', forwardPointer, true)
    window.addEventListener('contextmenu', forwardPointer, true)
}

export const ipcRenderer = {
    on(channel: string, listener: Listener) {
        if (!rendererListeners.has(channel)) rendererListeners.set(channel, new Set())
        rendererListeners.get(channel).add(listener)
        return ipcRenderer
    },
    once(channel: string, listener: Listener) {
        const wrapped: Listener = (e, ...args) => {
            ipcRenderer.removeListener(channel, wrapped)
            listener(e, ...args)
        }
        return ipcRenderer.on(channel, wrapped)
    },
    removeListener(channel: string, listener: Listener) {
        rendererListeners.get(channel)?.delete(listener)
        return ipcRenderer
    },
    removeAllListeners(channel?: string) {
        if (channel) rendererListeners.delete(channel)
        else rendererListeners.clear()
        return ipcRenderer
    },
    send(channel: string, ...args: any[]) {
        hostOfThisPage.send(windowId, channel, args)
    },
    async invoke(channel: string, ...args: any[]) {
        const result = await hostOfThisPage.invoke(windowId, channel, args)
        return isSubWindow ? clone(result) : result
    },
    sendSync(channel: string) {
        warnOnce('sendSync', channel)
        return undefined
    },
}
// endregion
