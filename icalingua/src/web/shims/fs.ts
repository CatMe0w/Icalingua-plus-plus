/**
 * 浏览器构建中 `fs` 的替身：表现为一个空的、只读的文件系统。
 * 渲染进程里读本地目录（表情、主题、自定义 CSS 等）的功能会因此静默失效。
 */
const enoent = (path: string) => Object.assign(new Error(`ENOENT (web): ${path}`), { code: 'ENOENT' })
const noop = () => {}

export const existsSync = () => false
export const mkdirSync = noop
export const readdirSync = () => []
export const writeFileSync = noop
export const statSync = (path: string) => {
    throw enoent(path)
}
export const readFileSync = (path: string) => {
    throw enoent(path)
}
export const readdir = (_path: string, cb: (err: Error | null, files: string[]) => void) => cb(null, [])
export const watch = () => ({ close: noop })

export const promises = {
    mkdir: async () => undefined,
    readdir: async () => [],
    writeFile: async () => undefined,
    stat: async (path: string) => {
        throw enoent(path)
    },
    readFile: async (path: string) => {
        throw enoent(path)
    },
}

export default {
    existsSync,
    mkdirSync,
    readdirSync,
    writeFileSync,
    statSync,
    readFileSync,
    readdir,
    watch,
    promises,
}
