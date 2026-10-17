/**
 * 浏览器构建中 `electron` 模块的替身。只覆盖渲染进程实际用到的部分。
 */
import { ipcRenderer } from '../ipcBus'

export { ipcRenderer }

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

export const clipboard = {
    writeText(text: string) {
        void navigator.clipboard?.writeText(text)
    },
    readText() {
        console.warn('[web] clipboard.readText 在浏览器中只能异步读取')
        return ''
    },
}

// 浏览器里的 File 没有本地路径
export const webUtils = {
    getPathForFile: () => '',
}

export default { ipcRenderer, shell, clipboard, webUtils }
