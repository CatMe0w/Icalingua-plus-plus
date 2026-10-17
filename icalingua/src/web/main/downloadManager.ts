/**
 * 替代 main/ipc/downloadManager.ts：交给浏览器下载。
 * 能跨域读取的文件直接存为文件；读取被拦截时（QQ 的 CDN 等）在新标签页打开，由用户自行保存。
 * 视频文件与桌面版不同，在子窗口中播放（其中也可以下载）。
 */
import Message from '@icalingua/types/Message'
import Room from '@icalingua/types/Room'
import { ipcMain } from 'electron'
import { getGroupFileMeta, getPrivateFileUrl } from '../../main/ipc/botAndStorage'
import { getConfig } from './configManager'
import { newIcalinguaWindow } from './IcalinguaWindow'
import { notifyUnsupported } from './unsupported'

const openUrl = (url: string) => window.open(url, '_blank', 'noopener')

const saveBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

/** 下载地址对应的文件；读取被跨域拦截时改为在新标签页打开 */
const saveUrl = async (url: string, filename?: string) => {
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        saveBlob(await res.blob(), filename || decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'))
    } catch {
        openUrl(url)
    }
}

export const download = (url: string, out?: string) => saveUrl(url, out)
export const downloadImage = async (url: string) => saveUrl(url, `${Date.now()}.${await getImageExt(url)}`)
export const downloadImage2Open = (url: string) => openUrl(url)
export const getImageExt = async (url: string) => {
    const type = url.startsWith('data:') ? url.slice(5, url.indexOf(';')) : ''
    return type.startsWith('image/') ? type.slice(6).replace('jpeg', 'jpg') : 'png'
}
export const saveTextAs = (text: string, filename: string) =>
    saveBlob(new Blob([text], { type: 'text/plain' }), filename)

/** 在子窗口中播放视频 */
export const openVideo = (url: string, name: string) => {
    const win = newIcalinguaWindow({ width: 900, height: 600, title: name || '视频' })
    const root = document.createElement('div')
    root.className = 'web-video-viewer'
    const video = document.createElement('video')
    video.src = url
    video.controls = true
    video.autoplay = true
    const bar = document.createElement('div')
    bar.className = 'web-video-bar'
    const save = document.createElement('button')
    save.textContent = '下载'
    save.addEventListener('click', () => saveUrl(url, name))
    const open = document.createElement('button')
    open.textContent = '在新标签页打开'
    open.addEventListener('click', () => openUrl(url))
    bar.append(save, open)
    root.append(video, bar)
    win.on('closed', () => video.pause())
    win.loadContent(root)
}

const fileUrl = async (gin: number | null, fid: string) => {
    if (gin) return ((await getGroupFileMeta(gin, fid)) as any)?.url as string | undefined
    return await getPrivateFileUrl(fid)
}

export const downloadGroupFile = async (gin: number, fid: string, name?: string) => {
    const url = await fileUrl(gin, fid)
    if (url) await saveUrl(url, name)
    else notifyUnsupported('下载该群文件')
}
export const downloadPrivateFileWithoutUrl = async (fid: string, name?: string) => {
    const url = await fileUrl(null, fid)
    if (url) await saveUrl(url, name)
    else notifyUnsupported('下载该文件')
}

/** 与桌面版的分支一致，只是视频改为在子窗口中播放 */
export const downloadFileByMessageData = async (data: { action: string; message: Message; room: Room }) => {
    if (data.action !== 'download') return
    const file = data.message.file
    if (!file) return
    if (file.type.includes('image')) return downloadImage(file.url)
    if (file.url === file.name && file.type.toLowerCase().includes('audio/'))
        return download(getConfig().server + '/records/' + file.url, 'QQ_Record_' + file.url)
    const gin = data.room.roomId < 0 && file.fid ? -data.room.roomId : null
    const url = file.url && !gin ? file.url : file.fid ? await fileUrl(gin, file.fid) : undefined
    if (!url) return notifyUnsupported('下载该文件')
    if (file.type.toLowerCase().startsWith('video/')) return openVideo(url, file.name || data.message.content)
    await saveUrl(url, file.name || data.message.content)
}

export const getDefaultDownloadPath = () => ''
export const loadConfig = () => {}

ipcMain.on('download', (_, url: string, out?: string) => download(url, out))
ipcMain.on('downloadImage', (_, url: string) => downloadImage(url))
ipcMain.on('downloadFileByMessageData', (_, data) => downloadFileByMessageData(data))
ipcMain.on('downloadGroupFile', (_, gin: number, fid: string, name?: string) => downloadGroupFile(gin, fid, name))
ipcMain.on('saveTextAs', (_, text: string, filename: string) => saveTextAs(text, filename))
// 下载交给浏览器管理，以下操作在网页版中没有意义
ipcMain.on('cancelDownload', () => {})
ipcMain.on('openDownloadedFile', () => {})
ipcMain.on('setAria2Config', () => notifyUnsupported('Aria2 下载'))
ipcMain.handle('createDownloadDirectory', () => '')
