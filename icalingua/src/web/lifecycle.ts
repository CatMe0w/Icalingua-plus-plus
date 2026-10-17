/**
 * 网页版的应用生命周期：复用的主进程代码在出错时会先弹对话框再 app.quit()，
 * 网页版把对话框内容记下来，"退出" 时回到连接表单并显示这条信息。
 */
const ERROR_KEY = 'icalingua-web-error'
let lastMessage = ''

export const rememberMessage = (message: string) => (lastMessage = message)

/** 回到连接表单，并显示 message（默认为最近一次错误对话框的内容） */
export const quitToConnectForm = (message = lastMessage) => {
    try {
        sessionStorage.setItem(ERROR_KEY, message || '已断开连接')
    } catch {
        // 无法写入时只是不显示原因
    }
    location.reload()
}

/** 取出并清除上次退出的原因 */
export const takeQuitMessage = () => {
    try {
        const message = sessionStorage.getItem(ERROR_KEY)
        sessionStorage.removeItem(ERROR_KEY)
        return message
    } catch {
        return null
    }
}
