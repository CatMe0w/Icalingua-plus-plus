/**
 * 网页版暂不支持的主进程功能（本地文件、系统集成等）在这里统一提示，而不是报错。
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
