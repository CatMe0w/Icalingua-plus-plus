/** 替代 main/utils/avatarCache.ts：浏览器自己会缓存图片，直接使用原地址 */
export default async (url: string) => url
