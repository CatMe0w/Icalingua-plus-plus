/**
 * 网页版的 "主进程"：按 main/ready.ts 的顺序加载与桌面版相同的主进程代码。
 * 它们依赖的桌面专用模块在构建时被替换为 web/main 下的实现（见 rspack.web.config.ts）。
 * 只在顶层页面加载；子窗口（iframe）只运行渲染进程代码。
 */
import { setMainWindowHooks } from './main/windowManager'
import './main/configManager'
import '../main/ipc/system'
import { createBot } from '../main/ipc/botAndStorage'
import './main/openImage'
import './main/downloadManager'
import '../main/ipc/menuManager'
import '../main/utils/themes'
import { getConfig } from './config'

export const startMainProcess = (hooks: Parameters<typeof setMainWindowHooks>[0]) => {
    setMainWindowHooks(hooks)
    // 与桌面版的 socketIo 适配器一样：连接 bridge 并完成 Ed25519 挑战鉴权
    createBot(getConfig().account)
}
