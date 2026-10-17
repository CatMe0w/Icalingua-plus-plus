/**
 * 静态资源（表情、超级表情、图标等）的统一入口。
 *
 * Electron 版：资源在本地 __static 目录，用 file:// 访问，用 fs 读取。
 * 网页版：index.html 设置 window.__staticUrl 为资源根 URL（可以是相对路径或 CDN/S3 地址），用 fetch 读取。
 */
import fs from 'fs'
import path from 'path'
import getStaticPath from '../../utils/getStaticPath'

const webStaticUrl: string | undefined = (window as any).__staticUrl

export const isWebStatic = typeof webStaticUrl === 'string'

/** 返回可直接用于 <img>/<audio> 等的地址，rel 为相对于 static 目录的路径 */
export const staticUrl = (rel: string) => {
    rel = rel.replace(/^\/+/, '')
    if (isWebStatic) return `${webStaticUrl.replace(/\/+$/, '')}/${rel}`
    return 'file://' + path.join(getStaticPath(), rel)
}

const padFaceId = (id: number | string) => String(id).padStart(3, '0')

/** QQ 小表情原图（多为动图），id 补零到三位 */
export const faceUrl = (id: number | string) => staticUrl('face/' + padFaceId(id))

/**
 * 表情面板用的缩略图。网页版使用构建时生成的 64px 首帧 WebP（原图平均约 130KB，
 * 一屏表情就有几十 MB）；Electron 版资源在本地，直接用原图。
 */
export const faceThumbUrl = (id: number | string) =>
    isWebStatic ? staticUrl(`face-thumb/${padFaceId(id)}.webp`) : faceUrl(id)

/** 读取 static 目录下的 JSON。key 为 staticUrl 或本地路径，读取结果按 key 缓存 */
const jsonCache = new Map<string, any>()

export const readStaticJsonSync = (key: string) => {
    if (jsonCache.has(key)) return jsonCache.get(key)
    if (isWebStatic) throw new Error(`网页版需要先调用 preloadStaticJson: ${key}`)
    const data = JSON.parse(fs.readFileSync(key, 'utf-8'))
    jsonCache.set(key, data)
    return data
}

/** 网页版中预先 fetch JSON 放入缓存，之后可同步读取；Electron 版为空操作 */
export const preloadStaticJson = async (key: string) => {
    if (!isWebStatic || jsonCache.has(key)) return
    const res = await fetch(key)
    if (!res.ok) throw new Error(`加载 ${key} 失败：HTTP ${res.status}`)
    jsonCache.set(key, await res.json())
}

/** 超级表情 JSON 的位置：Electron 版为本地路径，网页版为 URL */
export const lottieJsonKey = (rel: string) => (isWebStatic ? staticUrl(rel) : path.join(getStaticPath(), rel))
