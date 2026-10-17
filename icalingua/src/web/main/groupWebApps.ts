/**
 * 替代 main/utils/groupWebApps.ts。
 *
 * 群公告、群相册、群精华是 QQ 自己的网页，桌面版靠写入 bridge 账号的 cookie 和注入脚本来免登录打开。
 * 浏览器做不到这两点，网页版直接在新标签页打开同一地址，由用户在 QQ 网页上自行登录。
 *
 * 群文件是 bridge 自带的文件管理页面（/file-manager），网页版嵌入子窗口。
 * 桌面版通过 preload 让页面调用 uploadGroupFile IPC 上传，网页版改为页面 postMessage 把文件交给这里，
 * 登记成虚拟路径后调用同一个 IPC 处理函数（main/ipc/botAndStorage.ts），经主连接上传。
 */
import type Room from '@icalingua/types/Room'
import { requestGfsToken } from '../../main/ipc/botAndStorage'
import isAdmin from '../../main/utils/isAdmin'
import removeGroupNameEmotes from '../../utils/removeGroupNameEmotes'
import { getConfig } from './configManager'
import { newIcalinguaWindow } from './IcalinguaWindow'
import { ipcRenderer } from '../ipcBus'
import { registerFile } from '../webFiles'

const openInNewTab = (url: string) => window.open(url, '_blank', 'noopener')

export const openGroupEssence = async (room: Room) => {
    if (room.roomId < 0) openInNewTab('https://qun.qq.com/essence/index?gc=' + -room.roomId)
}

export const openGroupAlbum = async (room: Room) => {
    if (room.roomId < 0) openInNewTab('https://h5.qzone.qq.com/groupphoto/album?inqq=1&groupId=' + -room.roomId)
}

export const openGroupAnnouncements = async (room: Room) => {
    if (room.roomId < 0) openInNewTab('https://web.qun.qq.com/mannounce/index.html#gc=' + -room.roomId)
}

type UploadRequest = { type: 'icalingua:uploadGroupFile'; requestId: string; file: File; pid: string; name: string }

export const openGroupFiles = async (room: Room) => {
    if (room.roomId >= 0) return
    const groupId = -room.roomId
    const external = getConfig().externalGfsBrowser
    if (external) return openInNewTab(external.replace('{groupId}', String(groupId)))

    const token = await requestGfsToken(groupId)
    const bridgeOrigin = new URL(getConfig().server).origin
    // 桌面版在页面加载后注入 window.isAdmin，网页版通过 hash 传给页面
    const url = `${getConfig().server}/file-manager/?${token}#admin=${await isAdmin(room.roomId)}`
    const roomName = getConfig().removeGroupNameEmotes ? removeGroupNameEmotes(room.roomName) : room.roomName
    const win = newIcalinguaWindow({
        width: 1500,
        height: window.innerHeight - 80,
        title: `${roomName} 的群文件`,
        embedExternal: true,
    })

    const onMessage = async (e: MessageEvent<UploadRequest>) => {
        const frame = win.getFrameWindow()
        if (!frame || e.source !== frame || e.origin !== bridgeOrigin) return
        if (e.data?.type !== 'icalingua:uploadGroupFile') return
        const { requestId, file, pid, name } = e.data
        const reply = (message: object) => frame.postMessage({ requestId, ...message }, bridgeOrigin)
        const onProgress = (_: unknown, id: string, progress: number) =>
            id === requestId && reply({ type: 'icalingua:uploadProgress', progress })
        ipcRenderer.on('uploadGroupFileProgress', onProgress)
        try {
            await ipcRenderer.invoke('uploadGroupFile', requestId, groupId, registerFile(file), pid, name)
            reply({ type: 'icalingua:uploadResult', ok: true })
        } catch (error) {
            reply({ type: 'icalingua:uploadResult', ok: false, error: error?.message || String(error) })
        } finally {
            ipcRenderer.removeListener('uploadGroupFileProgress', onProgress)
        }
    }
    window.addEventListener('message', onMessage)
    win.on('closed', () => window.removeEventListener('message', onMessage))
    await win.loadURL(url)
}
