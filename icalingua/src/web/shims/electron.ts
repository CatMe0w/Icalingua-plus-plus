/**
 * 浏览器构建中 `electron` 模块的替身。覆盖渲染进程，以及网页版复用的主进程代码
 * （main/ipc/menuManager.ts、main/utils/ui.ts 等）实际用到的部分。
 */
import { ipcMain, ipcRenderer } from '../ipcBus'
import { quitToConnectForm, rememberMessage } from '../lifecycle'
import { createWindow, getWindowByWebContents, mainWindow } from '../webWindow'
import { Menu, MenuItem } from './electronMenu'

export { ipcMain, ipcRenderer, Menu, MenuItem }

export const shell = {
    openExternal(url: string) {
        window.open(url, '_blank', 'noopener')
        return Promise.resolve()
    },
    openPath(path: string) {
        console.warn('[web] shell.openPath 不可用', path)
        return Promise.resolve('')
    },
    showItemInFolder(path: string) {
        console.warn('[web] shell.showItemInFolder 不可用', path)
    },
}

/** nativeImage 只保存来源，复制到剪贴板时再按需读取 */
class WebNativeImage {
    constructor(readonly source: { url?: string; buffer?: Uint8Array }) {}
    isEmpty() {
        return !this.source.url && !this.source.buffer?.length
    }
    async toBlob(): Promise<Blob> {
        if (this.source.buffer) return new Blob([this.source.buffer])
        return await (await fetch(this.source.url)).blob()
    }
}

export const nativeImage = {
    createFromDataURL: (url: string) => new WebNativeImage({ url }),
    createFromBuffer: (buffer: Uint8Array) => new WebNativeImage({ buffer }),
    // 网页版没有本地文件
    createFromPath: () => new WebNativeImage({}),
    createEmpty: () => new WebNativeImage({}),
}

/** 浏览器剪贴板只稳定支持 PNG，其他格式先在 canvas 上转成 PNG */
const toPngBlob = async (blob: Blob): Promise<Blob> => {
    if (blob.type === 'image/png') return blob
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

const writeClipboard = (items: Record<string, Blob | Promise<Blob>>) =>
    navigator.clipboard.write([new ClipboardItem(items)]).catch((e) => console.warn('[web] 写入剪贴板失败', e))

export const clipboard = {
    writeText(text: string) {
        void navigator.clipboard?.writeText(text).catch((e) => console.warn('[web] 写入剪贴板失败', e))
    },
    writeHTML(html: string) {
        void writeClipboard({ 'text/html': new Blob([html], { type: 'text/html' }) })
    },
    writeImage(image: WebNativeImage) {
        // Safari 要求在用户操作的同步调用栈里创建 ClipboardItem，所以传入 Promise 而不是先 await
        void writeClipboard({ 'image/png': image.toBlob().then(toPngBlob) })
    },
    write(data: { text?: string; html?: string }) {
        const items: Record<string, Blob> = {}
        if (data.text) items['text/plain'] = new Blob([data.text], { type: 'text/plain' })
        if (data.html) items['text/html'] = new Blob([data.html], { type: 'text/html' })
        void writeClipboard(items)
    },
    readText() {
        console.warn('[web] clipboard.readText 在浏览器中只能异步读取')
        return ''
    },
    read: () => '',
    availableFormats: (): string[] => [],
}

export const app = {
    getPath: () => '',
    getVersion: () => '',
    quit: () => quitToConnectForm(),
    exit: () => quitToConnectForm(),
    relaunch: () => {},
    isPackaged: true,
}

type MessageBoxOptions = { message?: string; buttons?: string[]; type?: string }

export const dialog = {
    showOpenDialogSync: (): string[] | undefined => undefined,
    showSaveDialogSync: (): string | undefined => undefined,
    showMessageBox: async (winOrOptions: unknown, maybeOptions?: MessageBoxOptions) => {
        const options = maybeOptions ?? (winOrOptions as MessageBoxOptions)
        if (options?.buttons && options.buttons.length > 1) return { response: confirm(options.message) ? 0 : 1 }
        // 错误对话框之后通常紧跟 app.quit()，由连接表单显示这条信息
        if (options?.type === 'error') rememberMessage(options.message)
        else alert(options?.message)
        return { response: 0 }
    },
}

export const screen = {
    getPrimaryDisplay: () => ({
        size: { width: window.screen.width, height: window.screen.height },
        workAreaSize: { width: window.screen.availWidth, height: window.screen.availHeight },
        scaleFactor: window.devicePixelRatio,
    }),
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)')

export const nativeTheme = {
    get shouldUseDarkColors() {
        return darkQuery.matches
    },
    themeSource: 'system',
    on: (event: string, callback: () => void) => {
        if (event === 'updated') darkQuery.addEventListener('change', callback)
    },
}

/** new BrowserWindow(options) 创建网页版子窗口 */
export const BrowserWindow: any = function (options?: Record<string, any>) {
    return createWindow(options)
}
BrowserWindow.fromWebContents = getWindowByWebContents
BrowserWindow.getFocusedWindow = () => mainWindow

/** macOS / Windows 才会用到 Electron 的通知，网页版走 freedesktop-notifications 替身 */
export class Notification {
    static isSupported() {
        return false
    }
    on() {}
    show() {}
    close() {}
}

export const globalShortcut = {
    register: () => false,
    unregister: () => {},
    unregisterAll: () => {},
}

// 浏览器里的 File 没有本地路径
export const webUtils = {
    getPathForFile: () => '',
}

export default {
    ipcMain,
    ipcRenderer,
    Menu,
    MenuItem,
    shell,
    nativeImage,
    clipboard,
    app,
    dialog,
    screen,
    nativeTheme,
    BrowserWindow,
    Notification,
    globalShortcut,
    webUtils,
}
