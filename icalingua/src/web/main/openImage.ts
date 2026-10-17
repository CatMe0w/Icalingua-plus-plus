/** 替代 main/ipc/openImage.ts：在新标签页打开图片 */
import { ipcMain } from 'electron'
import { unsupported } from './unsupported'

const openImage = (url: string) => window.open(url, '_blank', 'noopener')

ipcMain.on('openImage', (_, url: string) => openImage(url))
ipcMain.on('saveSticker', unsupported('保存表情'))

export default openImage
