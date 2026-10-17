/**
 * 浏览器里的 File 没有本地路径。网页版在用户选择文件时把它登记在这里，换成一个虚拟路径，
 * 交给与桌面版相同的发送/上传代码；web/shims/fs.ts 再按虚拟路径读取文件内容。
 *
 * 虚拟路径形如 blob:https://host/uuid#/文件名：渲染进程会把路径直接用作图片、视频的预览地址，
 * 对象 URL 可以直接加载（# 后的部分会被忽略）；按 / 截取的最后一段仍是文件名。
 *
 * 登记表放在顶层页面上，子窗口（iframe）登记的文件主进程代码也能读到。
 */

const registry: Map<string, Blob> = (() => {
    let root: any = window
    try {
        if ((window.top as any).__icalinguaHost) root = window.top
    } catch {
        // 跨源时只能使用自己的登记表
    }
    return (root.__icalinguaFiles ??= new Map())
})()

/** 登记文件并返回虚拟路径，路径以文件名结尾，与本地路径一样可以取出文件名 */
export const registerFile = (file: Blob & { name?: string }) => {
    const path = `${URL.createObjectURL(file)}#/${file.name || 'file'}`
    registry.set(path, file)
    return path
}

export const getRegisteredFile = (path: unknown): Blob | undefined =>
    typeof path === 'string' && path.startsWith('blob:') ? registry.get(path) : undefined
