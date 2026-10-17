/**
 * 浏览器构建中 `os` / `crypto` / `vue-electron` 的替身，以及全局 `process`。
 */
import md5 from 'md5'

export const tmpdir = () => '/tmp'

// 渲染进程只用到了 createHash('md5')
export const createHash = (algorithm: string) => {
    if (algorithm !== 'md5') throw new Error(`[web] 不支持的哈希算法: ${algorithm}`)
    const chunks: any[] = []
    const hash = {
        update(data: any) {
            chunks.push(data)
            return hash
        },
        digest(encoding: string) {
            if (encoding !== 'hex') throw new Error(`[web] 不支持的 digest 编码: ${encoding}`)
            const data = chunks.length === 1 ? chunks[0] : chunks.map((c) => (typeof c === 'string' ? c : '')).join('')
            return md5(data)
        },
    }
    return hash
}

// vue-electron 插件在浏览器里什么也不做
export const install = () => {}

export const process = {
    env: {},
    platform: 'web',
    versions: { electron: '-', node: '-', chrome: navigator.userAgent },
    cwd: () => '/',
}

export default { tmpdir, createHash, install }
