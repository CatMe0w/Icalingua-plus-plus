/** 替代 main/ipc/downloadManager.ts：交给浏览器打开或下载 */
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import { ipcMain } from 'electron'
import { getGroupFileMeta, getPrivateFileUrl } from '../../main/ipc/botAndStorage'
import { notifyUnsupported } from './unsupported'

const openUrl = (url: string) => window.open(url, '_blank', 'noopener')

export const download = (url: string) => openUrl(url)
export const downloadImage = (url: string) => openUrl(url)
export const downloadImage2Open = (url: string) => openUrl(url)
export const getImageExt = async (url: string) => {
    const type = url.startsWith('data:') ? url.slice(5, url.indexOf(';')) : ''
    return type.startsWith('image/') ? type.slice(6).replace('jpeg', 'jpg') : 'png'
}
export const saveTextAs = (text: string, filename: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
}
export const downloadGroupFile = async (gin: number, fid: string) => {
    const meta: any = await getGroupFileMeta(gin, fid)
    if (meta?.url) openUrl(meta.url)
    else notifyUnsupported('下载该群文件')
}
export const downloadPrivateFileWithoutUrl = async (fid: string) => {
    const url = await getPrivateFileUrl(fid)
    if (url) openUrl(url)
    else notifyUnsupported('下载该文件')
}
export const downloadFileByMessageData = async (data: { action: string; message: Message; room: Room }) => {
    const file = data.message.file || data.message.files?.[0]
    if (file?.url) openUrl(file.url)
    else if (file?.fid && data.room.roomId < 0) await downloadGroupFile(-data.room.roomId, file.fid)
    else if (file?.fid) await downloadPrivateFileWithoutUrl(file.fid)
}

export const getDefaultDownloadPath = () => ''
export const loadConfig = () => {}

ipcMain.on('download', (_, url: string) => download(url))
ipcMain.on('downloadImage', (_, url: string) => downloadImage(url))
ipcMain.on('downloadFileByMessageData', (_, data) => downloadFileByMessageData(data))
ipcMain.on('downloadGroupFile', (_, gin: number, fid: string) => downloadGroupFile(gin, fid))
ipcMain.on('saveTextAs', (_, text: string, filename: string) => saveTextAs(text, filename))
// 下载交给浏览器管理，以下操作在网页版中没有意义
ipcMain.on('cancelDownload', () => {})
ipcMain.on('openDownloadedFile', () => {})
ipcMain.on('setAria2Config', () => notifyUnsupported('Aria2 下载'))
ipcMain.handle('createDownloadDirectory', () => '')
