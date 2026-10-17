/** 替代 main/utils/windowManager.ts：网页版只有当前页面这一个窗口 */
import { emitToRenderer } from '../ipcBus'
import { webWindow } from '../webWindow'
import { unsupported } from './unsupported'

export const getMainWindow = () => webWindow
export const getRoomIdByWindow = (): number | undefined => undefined
export const sendToWindow = (_win: unknown, channel: string, ...args: any[]) => emitToRenderer(channel, ...args)
export const sendToMainWindow = (channel: string, ...args: any[]) => emitToRenderer(channel, ...args)
export const tryToShowMainWindow = (callback?: () => void) => {
    window.focus()
    callback?.()
}
export const tryToShowAllWindows = () => window.focus()

// 独立聊天窗口在网页版中不存在
export const isRoomInChatWindow = () => false
export const sendToChatWindow = () => {}
export const sendToAllChatWindows = () => {}
export const sendToRequestWindow = () => {}
export const openChatWindow = unsupported('独立聊天窗口')

export const lockMainWindow = unsupported('锁定')
export const showAria2SettingsWindow = unsupported('Aria2 设置')
export const showDeviceManagerWindow = unsupported('设备管理')
export const showIgnoreManageWindow = unsupported('屏蔽管理')
export const showRequestWindow = unsupported('好友/加群请求')
export const showSetLockPasswordWindow = unsupported('设置锁定密码')
export const showSettingsWindow = unsupported('设置')
