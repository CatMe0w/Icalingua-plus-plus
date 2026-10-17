/**
 * 替代 freedesktop-notifications，用浏览器通知实现。
 * socketIoAdapter 在非 macOS/Windows 平台上走这个分支，所以网页版的通知逻辑（优先级、@ 判断等）与桌面版一致。
 */
type Params = { summary?: string; body?: string; icon?: string }

export class Notification {
    private handlers = new Map<string, (arg?: string) => void>()

    constructor(private readonly params: Params) {}

    on(event: string, handler: (arg?: string) => void) {
        this.handlers.set(event, handler)
        return this
    }

    async push() {
        if (!('Notification' in window)) return
        if (window.Notification.permission === 'default') await window.Notification.requestPermission()
        if (window.Notification.permission !== 'granted') return
        const notif = new window.Notification(this.params.summary || '', {
            body: this.params.body,
            icon: this.params.icon,
        })
        notif.onclick = () => {
            window.focus()
            this.handlers.get('action')?.('default')
            notif.close()
        }
    }
}
