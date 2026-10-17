/**
 * 替代 main/utils/windowManager.ts。主窗口是当前页面，其余窗口是页面内的浮动子窗口（见 web/webWindow.ts），
 * 各窗口的路由、尺寸与桌面版保持一致。
 */
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import getWinUrl from './getWinUrl'
import { mainWindow, WebWindow } from '../webWindow'
import { newIcalinguaWindow } from './IcalinguaWindow'
import { notifyUnsupported } from './unsupported'

type Win = WebWindow

// region 主窗口与登录
export interface MainWindowHooks {
    /** 首次收到 onlineData：挂载主界面 */
    onLoad: () => void
    /** bridge 需要登录，登录窗口已打开 */
    onLoginShown: () => void
    /** 未登录就关闭了登录窗口 */
    onLoginCancelled: () => void
}
let hooks: MainWindowHooks
let mainWindowLoaded = false

/** 由 web/main.ts 设置 */
export const setMainWindowHooks = (value: MainWindowHooks) => (hooks = value)

export const getMainWindow = () => mainWindow
export const loadMainWindow = async () => {
    mainWindowLoaded = true
    hooks.onLoad()
}
export const showMainWindow = () => window.focus()
export const tryToShowMainWindow = (callback?: () => void) => {
    window.focus()
    callback?.()
}
export const tryToShowAllWindows = () => window.focus()
export const refreshMainWindowColor = () => {}
export const setMainWindowTitleBarHidden = async () => {}
export const setZoomFactorForAllWindows = () => {}
export const getMainWindowScreen = () => ({ size: { width: window.innerWidth, height: window.innerHeight } })
export const sendToMainWindow = (channel: string, payload?: any) => mainWindow.webContents.send(channel, payload)
export const sendToWindow = (target: Win | undefined, channel: string, ...payload: any[]) => {
    if (target && !target.isDestroyed()) target.webContents.send(channel, ...payload)
}

// 登录窗口：与桌面版一样打开 #/login，滑块、设备锁等验证页见 web/externalPage.ts
let loginWindow: Win | null = null
let loginWindowLoading: Promise<void> | null = null

export const getLoginWindow = () => loginWindow
export const showLoginWindow = (isConfiguringBridge = false, disableIdLogin = false) => {
    if (loginWindow) {
        loginWindow.show()
        loginWindow.focus()
        return loginWindowLoading
    }
    const win = newIcalinguaWindow({ width: 550, height: 720, title: '登录' })
    loginWindow = win
    win.on('closed', () => {
        if (loginWindow === win) loginWindow = null
        // 登录成功时由 socketIoAdapter 关闭登录窗口；未登录就关闭则回到连接表单
        if (!mainWindowLoaded) hooks.onLoginCancelled()
    })
    hooks.onLoginShown()
    loginWindowLoading = win.loadURL(
        getWinUrl() + `#/login?bridge=${isConfiguringBridge}&disableIdLogin=${disableIdLogin}`,
    )
    return loginWindowLoading
}
export const sendToLoginWindow = (channel: string, payload?: any) => {
    if (loginWindow) loginWindow.webContents.send(channel, payload)
    else showLoginWindow().then(() => loginWindow?.webContents.send(channel, payload))
}

// 网页版不支持锁定
export const isAppLocked = () => false
export const lockMainWindow = () => notifyUnsupported('锁定')
export const judgeLocked = (callback: () => void) => callback()
// endregion

// region 数据库升级进度
const databaseUpgradeProgress: DatabaseUpgradeProgress = { active: false, step: 0, total: 0, message: '' }
export const getDatabaseUpgradeProgress = (): DatabaseUpgradeProgress => ({ ...databaseUpgradeProgress })
export const sendDatabaseUpgradeProgress = (progress: DatabaseUpgradeProgress) => {
    Object.assign(databaseUpgradeProgress, progress)
    sendToMainWindow('dbUpgradeProgress', databaseUpgradeProgress)
    sendToSettingsWindow('dbUpgradeProgress', databaseUpgradeProgress)
}
// endregion

// region 单例窗口
const singletons = new Map<string, Win>()

/** 同一种窗口只开一个，已打开时聚焦 */
const showSingleton = (route: string, options: Record<string, any>, title: string) => {
    const existing = singletons.get(route)
    if (existing && !existing.isDestroyed()) {
        existing.show()
        existing.focus()
        return existing
    }
    const win = newIcalinguaWindow({ title, ...options })
    singletons.set(route, win)
    win.on('closed', () => singletons.get(route) === win && singletons.delete(route))
    void win.loadURL(getWinUrl() + '#/' + route)
    return win
}
const sendToSingleton = (route: string, channel: string, payload?: any) =>
    sendToWindow(singletons.get(route), channel, payload)

export const showSettingsWindow = () => showSingleton('settings', { width: 1040, height: 760 }, '设置')
export const sendToSettingsWindow = (channel: string, payload?: any) => sendToSingleton('settings', channel, payload)
export const showIgnoreManageWindow = () => showSingleton('ignoreManage', { width: 500, height: 700 }, '屏蔽管理')
export const showAria2SettingsWindow = () => showSingleton('aria2', { width: 500, height: 485 }, 'Aria2 设置')
export const showSetLockPasswordWindow = () => showSingleton('setLockPassword', { width: 500, height: 200 }, '锁定密码')
export const showRequestWindow = () => showSingleton('friendRequest', { width: 600, height: 700 }, '好友与加群请求')
export const sendToRequestWindow = (channel: string, payload?: any) =>
    sendToSingleton('friendRequest', channel, payload)
export const showDeviceManagerWindow = () => showSingleton('deviceManager', { width: 750, height: 600 }, '设备管理')
export const sendToDeviceManagerWindow = (channel: string, payload?: any) =>
    sendToSingleton('deviceManager', channel, payload)
// endregion

// region 独立聊天窗口
const chatWindows = new Map<number, Win>()

export const isRoomInChatWindow = (roomId: number) =>
    !!chatWindows.get(roomId) && !chatWindows.get(roomId).isDestroyed()
export const getChatWindow = (roomId: number) => (isRoomInChatWindow(roomId) ? chatWindows.get(roomId) : undefined)
export const getAllChatWindowRoomIds = () => [...chatWindows.keys()].filter(isRoomInChatWindow)
export const sendToChatWindow = (roomId: number, channel: string, payload?: any) =>
    sendToWindow(chatWindows.get(roomId), channel, payload)
export const sendToAllChatWindows = (channel: string, payload?: any) =>
    chatWindows.forEach((win) => sendToWindow(win, channel, payload))
export const getRoomIdByWindow = (win: Win): number | undefined => {
    for (const [roomId, w] of chatWindows) if (w === win || w.id === win?.id) return roomId
    return undefined
}
export const focusChatWindow = (roomId: number) => {
    const win = getChatWindow(roomId)
    if (!win) return false
    win.show()
    win.focus()
    return true
}
export const closeChatWindow = (roomId: number) => getChatWindow(roomId)?.close()

export const openChatWindow = async (roomId: number, roomName: string, gotoMessageId?: string) => {
    if (isRoomInChatWindow(roomId)) {
        focusChatWindow(roomId)
        if (gotoMessageId) sendToChatWindow(roomId, 'gotoMessage', gotoMessageId)
        return
    }
    const win = newIcalinguaWindow({ width: 900, height: window.innerHeight - 80, title: roomName })
    chatWindows.set(roomId, win)
    win.on('closed', () => chatWindows.get(roomId) === win && chatWindows.delete(roomId))
    win.on('focus', () => win.webContents.send('clearUnread'))
    win.webContents.on('did-finish-load', () => {
        // 与桌面版一样延迟发送，确保 Vue 组件已初始化
        if (gotoMessageId) setTimeout(() => win.webContents.send('gotoMessage', gotoMessageId), 500)
    })
    await win.loadURL(getWinUrl() + '#/chatWindow/' + roomId)
}
// endregion
