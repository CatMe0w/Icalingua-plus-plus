/** 替代 main/utils/trayManager.ts：网页版没有托盘，把未读会话数显示在标题里 */
import { getNickname, getUnreadCount } from '../../main/ipc/botAndStorage'

export const createTray = async () => {}
export const updateTrayMenu = async () => {}
export const updateTrayIcon = async (_force?: boolean) => {
    const unread = await getUnreadCount()
    const nickname = getNickname()
    document.title = (unread ? `(${unread}) ` : '') + (nickname ? `${nickname} - ` : '') + 'Icalingua++'
}
