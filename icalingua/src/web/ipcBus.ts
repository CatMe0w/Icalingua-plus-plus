/**
 * 浏览器内的 IPC 总线：用同一个页面里的两个对象模拟 Electron 的 ipcRenderer / ipcMain，
 * 让渲染进程代码不改动就能运行。bridge.ts 在 "main" 一侧注册处理函数。
 */

type Listener = (event: IpcEvent, ...args: any[]) => void
type Handler = (event: IpcEvent, ...args: any[]) => any

interface IpcEvent {
    sender: { send: (channel: string, ...args: any[]) => void }
}

const rendererListeners = new Map<string, Set<Listener>>()
const mainOnHandlers = new Map<string, Set<Handler>>()
const mainInvokeHandlers = new Map<string, Handler>()
const warned = new Set<string>()

const warnOnce = (kind: string, channel: string) => {
    const key = kind + ':' + channel
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`[web] 未实现的 IPC ${kind}: ${channel}`)
}

const event: IpcEvent = {
    sender: { send: (channel, ...args) => emitToRenderer(channel, ...args) },
}

/** main → renderer，对应 webContents.send / sendToMainWindow */
export const emitToRenderer = (channel: string, ...args: any[]) => {
    const listeners = rendererListeners.get(channel)
    if (!listeners) return
    for (const listener of [...listeners]) {
        try {
            listener(event, ...args)
        } catch (e) {
            console.error(`[web] 处理 ${channel} 时出错`, e)
        }
    }
}

export const ipcMain = {
    // 与 Electron 一样，同一通道可以有多个监听器（如 ui.ts 与 bridge.ts 都监听 setSelectedRoom）
    on(channel: string, handler: Handler) {
        if (!mainOnHandlers.has(channel)) mainOnHandlers.set(channel, new Set())
        mainOnHandlers.get(channel).add(handler)
    },
    handle(channel: string, handler: Handler) {
        mainInvokeHandlers.set(channel, handler)
    },
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
        const handlers = mainOnHandlers.get(channel)
        if (!handlers) return warnOnce('send', channel)
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
    async invoke(channel: string, ...args: any[]) {
        const handler = mainInvokeHandlers.get(channel)
        if (!handler) {
            warnOnce('invoke', channel)
            return undefined
        }
        return await handler(event, ...args)
    },
    sendSync(channel: string) {
        warnOnce('sendSync', channel)
        return undefined
    },
}
