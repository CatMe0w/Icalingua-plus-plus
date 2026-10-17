/**
 * 网页版暂不支持的主进程功能（独立窗口、本地文件、系统集成等）在这里统一提示，而不是报错。
 */
import { emitToRenderer } from '../ipcBus'

export const notifyUnsupported = (what: string) => {
    console.warn('[web] 网页版暂不支持：' + what)
    emitToRenderer('messageError', '网页版暂不支持：' + what)
}

/** 返回一个调用即提示的函数 */
export const unsupported =
    (what: string) =>
    (..._args: any[]): any =>
        notifyUnsupported(what)

/**
 * 吸收任意属性访问和调用的对象，用作 newIcalinguaWindow 等返回的 "窗口"。
 * loadURL 时提示具体是哪个页面没能打开。
 */
export const createFakeWindow = (): any => {
    const handler: ProxyHandler<any> = {
        get: (_target, prop) => {
            if (prop === 'loadURL')
                return (url: string) => notifyUnsupported('打开窗口 ' + (String(url).split('#')[1] || url))
            if (prop === 'isDestroyed') return () => true
            if (prop === 'then') return undefined
            return fake
        },
        apply: () => fake,
    }
    const fake: any = new Proxy(function () {}, handler)
    return fake
}
