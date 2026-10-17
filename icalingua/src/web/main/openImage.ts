/**
 * 替代 main/ipc/openImage.ts：与桌面版一样用 static/imgView.html 查看图片（缩放、旋转、上一张/下一张、右键菜单），
 * 只是窗口换成页面内的子窗口。网页版没有外部看图程序，"使用本地查看器" 也用同一个查看器。
 */
import { ipcMain } from 'electron'
import { getConfig, saveConfigFile } from './configManager'
import { newIcalinguaWindow } from './IcalinguaWindow'
import { downloadImage } from './downloadManager'
import { unsupported } from './unsupported'
import { staticUrl } from '../../renderer/utils/staticAsset'

const viewers = new Map<string, ReturnType<typeof newIcalinguaWindow>>()

const openImage = (url: string, _external = false, urlList: string[] = []) => {
    const existing = viewers.get(url)
    if (existing && !existing.isDestroyed()) return existing.focus()

    const size = getConfig().imageViewerSize
    const win = newIcalinguaWindow({ width: size.width, height: size.height, title: '查看图片' })
    win.on('close', () => {
        const [width, height] = win.getSize()
        getConfig().imageViewerSize = { width, height, max: false }
        saveConfigFile()
    })
    const multiple = urlList.length > 1 && !getConfig().singleImageMode
    if (!multiple) {
        viewers.set(url, win)
        win.on('closed', () => viewers.get(url) === win && viewers.delete(url))
    }
    win.webContents.on('did-finish-load', () => {
        const frame: any = win.getSameOriginFrame()
        if (!frame) return
        // 桌面版由 imgViewPreload.js 提供的函数，以及关闭窗口
        frame.downloadImage = (src: string) => downloadImage(src)
        frame.copyImage = (src: string) => ipcMain.emit('copyImage', null, src)
        frame.saveSticker = unsupported('添加为表情')
        frame.close = () => win.close()
        // 以下与桌面版相同
        if (multiple) {
            win.webContents.executeJavaScript(`window.imgs = ${JSON.stringify(urlList)};`)
        } else {
            win.webContents.executeJavaScript(
                `window.imgs = ${JSON.stringify([url])};` +
                    `document.getElementById('BAR').style['min-width'] = '380px';` +
                    `document.getElementById('BAR_TABLE').style['min-width'] = '360px';` +
                    `document.getElementById('prev').parentElement.style['display'] = 'none';` +
                    `document.getElementById('next').parentElement.style['display'] = 'none';`,
            )
        }
        win.webContents.executeJavaScript(`window.disableTouchPad = ${getConfig().disableImgViewTouchPad};`)
    })
    void win.loadURL(staticUrl('imgView.html') + '?url=' + encodeURIComponent(url))
}

ipcMain.on('openImage', (_, url: string, external = false, urlList: string[] = []) => openImage(url, external, urlList))
ipcMain.on('saveSticker', unsupported('保存表情'))

export default openImage
