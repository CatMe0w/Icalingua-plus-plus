/**
 * 浏览器构建中 `os` / `crypto` / `vue-electron` 的替身，以及全局 `process`。
 */
import md5 from 'md5'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export const tmpdir = () => '/tmp'

// 用到的只有 md5（表情预览等的缓存 key）和 sha256（上传文件到 bridge 时的分块校验）
export const createHash = (algorithm: string) => {
    if (algorithm === 'sha256') {
        const hash = sha256.create()
        const wrapper = {
            update(data: Uint8Array | string) {
                hash.update(typeof data === 'string' ? new TextEncoder().encode(data) : data)
                return wrapper
            },
            digest(encoding: string) {
                if (encoding !== 'hex') throw new Error(`[web] 不支持的 digest 编码: ${encoding}`)
                return bytesToHex(hash.digest())
            },
        }
        return wrapper
    }
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

export const randomBytes = (size: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(size)))

// vue-electron 插件在浏览器里什么也不做
export const install = () => {}

export const process = {
    env: {},
    platform: 'web',
    versions: { electron: '-', node: '-', chrome: navigator.userAgent },
    cwd: () => '/',
}

export default { tmpdir, createHash, randomBytes, install }
