/**
 * 浏览器构建中 `fs` 的替身：表现为一个空的、只读的文件系统，
 * 只有用户选择的文件（见 web/webFiles.ts）可以通过虚拟路径读取，供发送文件、上传群文件使用。
 * 渲染进程里读本地目录（表情、主题、自定义 CSS 等）的功能会因此静默失效。
 */
import { getRegisteredFile } from '../webFiles'

type Callback<T> = (err: Error | null, result?: T) => void

const enoent = (path: string) => Object.assign(new Error(`ENOENT (web): ${path}`), { code: 'ENOENT' })
const noop = () => {}

const statOf = (file: Blob) => ({
    size: file.size,
    isFile: () => true,
    isDirectory: () => false,
    mtimeMs: (file as File).lastModified ?? Date.now(),
})

const readRange = async (file: Blob, start: number, end: number) =>
    new Uint8Array(await file.slice(start, end).arrayBuffer())

export const existsSync = (path: string) => !!getRegisteredFile(path)
export const mkdirSync = noop
export const readdirSync = () => []
export const writeFileSync = noop
export const rmdirSync = noop
export const statSync = (path: string) => {
    const file = getRegisteredFile(path)
    if (!file) throw enoent(path)
    return statOf(file)
}
export const readFileSync = (path: string) => {
    // 桌面版读取 static 下的脚本注入外部页面（如滑块验证的 sliderinj.js），网页版无法注入，当作空脚本
    if (path.endsWith('.js')) return ''
    throw enoent(path)
}
export const readdir = (_path: string, cb: Callback<string[]>) => cb(null, [])
export const watch = () => ({ close: noop })

/** 按块读取虚拟文件，接口与 Node 的 ReadStream 事件一致（data / end / error） */
export const createReadStream = (path: string) => {
    const handlers: Record<string, ((arg?: any) => void)[]> = {}
    const emit = (event: string, arg?: any) => handlers[event]?.forEach((h) => h(arg))
    const stream = {
        on(event: string, handler: (arg?: any) => void) {
            ;(handlers[event] ??= []).push(handler)
            return stream
        },
    }
    const file = getRegisteredFile(path)
    setTimeout(async () => {
        if (!file) return emit('error', enoent(path))
        try {
            const chunkSize = 4 * 1024 * 1024
            for (let offset = 0; offset < file.size; offset += chunkSize)
                emit('data', Buffer.from(await readRange(file, offset, offset + chunkSize)))
            emit('end')
        } catch (e) {
            emit('error', e)
        }
    })
    return stream
}

// 虚拟文件的 "文件描述符" 就是它的路径
export const open = (path: string, _flags: string, cb: Callback<string>) =>
    getRegisteredFile(path) ? cb(null, path) : cb(enoent(path))
export const read = (
    fd: string,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
    cb: (err: Error | null, bytesRead?: number, buffer?: Uint8Array) => void,
) => {
    const file = getRegisteredFile(fd)
    if (!file) return cb(enoent(fd))
    readRange(file, position, position + length).then(
        (data) => {
            buffer.set(data, offset)
            cb(null, data.length, buffer)
        },
        (e) => cb(e),
    )
}
export const close = (_fd: string, cb?: () => void) => cb?.()

export const promises = {
    mkdir: async () => undefined,
    readdir: async () => [],
    writeFile: async () => undefined,
    stat: async (path: string) => statSync(path),
    readFile: async (path: string) => {
        const file = getRegisteredFile(path)
        if (!file) throw enoent(path)
        return Buffer.from(await readRange(file, 0, file.size))
    },
}

export default {
    existsSync,
    mkdirSync,
    readdirSync,
    writeFileSync,
    rmdirSync,
    statSync,
    readFileSync,
    readdir,
    watch,
    createReadStream,
    open,
    read,
    close,
    promises,
}
