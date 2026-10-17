/**
 * 网页版只有一个 "窗口"：当前页面。这个对象模拟主进程代码会用到的 BrowserWindow 方法。
 */
import { emitToRenderer } from './ipcBus'
import { pointerScreenOffset } from './shims/electronMenu'

const noop = () => {}

export const webWindow = {
    webContents: {
        send: (channel: string, ...args: any[]) => emitToRenderer(channel, ...args),
        on: noop,
        once: noop,
        setZoomFactor: noop,
        setWindowOpenHandler: noop,
        executeJavaScript: async () => undefined,
        isDestroyed: () => false,
    },
    /** menuManager 用渲染进程传来的屏幕坐标减去这个位置，得到菜单在页面内的坐标 */
    getContentBounds: () => ({
        x: pointerScreenOffset.x,
        y: pointerScreenOffset.y,
        width: window.innerWidth,
        height: window.innerHeight,
    }),
    getBounds: () => ({ x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight }),
    getPosition: () => [window.screenX, window.screenY],
    getSize: () => [window.innerWidth, window.innerHeight],
    isDestroyed: () => false,
    isFocused: () => document.hasFocus(),
    isVisible: () => document.visibilityState === 'visible',
    isMinimized: () => false,
    show: () => window.focus(),
    focus: () => window.focus(),
    on: noop,
    once: noop,
}

export type WebWindow = typeof webWindow
