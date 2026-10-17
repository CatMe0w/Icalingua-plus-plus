/** 浏览器构建中 `querystring` 的替身（menuManager 只用到 escape） */
export const escape = encodeURIComponent
export const unescape = decodeURIComponent
export const stringify = (obj: Record<string, string>) => new URLSearchParams(obj).toString()
export const parse = (str: string) => Object.fromEntries(new URLSearchParams(str))

export default { escape, unescape, stringify, parse }
