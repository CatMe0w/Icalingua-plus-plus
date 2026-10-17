/**
 * 网页版入口。
 *
 * 顶层页面：先显示连接表单，鉴权成功并收到 onlineData 后再挂载与桌面版相同的 Vue 应用（主窗口）。
 * 子窗口（iframe）：直接挂载 Vue 应用，路由由 iframe 地址的 hash 决定，通过顶层页面的 IPC 总线通信。
 */
import Vue from 'vue'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import App from '../renderer/App.vue'
import router from '../renderer/router'
import { isSubWindow } from './ipcBus'
import { getConfig, updateConfig } from './config'
import { quitToConnectForm, takeQuitMessage } from './lifecycle'
import { Menu } from './shims/electronMenu'

// 桌面版没有浏览器自带的右键菜单，网页版也屏蔽它，由应用自己的菜单接管；按住 Shift 时保留浏览器菜单
window.addEventListener('contextmenu', (e) => {
    if (!e.shiftKey) e.preventDefault()
})

const mountApp = () => {
    Vue.config.productionTip = false
    Vue.use(ElementUI)
    new Vue({
        components: { App },
        router,
        template: '<App/>',
    }).$mount('#app')
}

/** 桌面版的设置等入口在窗口菜单栏里，网页版放一个按钮弹出同一份应用菜单 */
const addAppMenuButton = () => {
    const button = document.createElement('button')
    button.id = 'app-menu-button'
    button.title = '菜单'
    button.textContent = '☰'
    button.addEventListener('click', () => {
        const rect = button.getBoundingClientRect()
        Menu.getApplicationMenu()?.popup({ x: rect.right, y: rect.top })
    })
    document.body.appendChild(button)
}

const startTopPage = () => {
    const form = document.getElementById('connect-form') as HTMLFormElement
    const serverInput = document.getElementById('connect-server') as HTMLInputElement
    const keyInput = document.getElementById('connect-key') as HTMLInputElement
    const errorBox = document.getElementById('connect-error')
    const submitButton = form.querySelector('button')

    const showForm = (error?: string) => {
        document.getElementById('connect').hidden = false
        errorBox.textContent = error || ''
        submitButton.disabled = false
    }

    const start = async () => {
        submitButton.disabled = true
        errorBox.textContent = '正在连接…'
        // 主进程代码较大，单独打包，子窗口不需要加载
        const { startMainProcess } = await import('./mainProcess')
        startMainProcess({
            onLoad() {
                document.getElementById('connect').hidden = true
                mountApp()
                if (router.currentRoute.path !== '/main') router.replace('/main')
                addAppMenuButton()
            },
            // 状态散落在 socket 和各个主进程模块里，回到表单时整页重载最简单可靠
            onLoginRequired: quitToConnectForm,
        })
    }

    const config = getConfig()
    serverInput.value = config.server
    keyInput.value = config.privateKey

    form.addEventListener('submit', (e) => {
        e.preventDefault()
        updateConfig({ server: serverInput.value.replace(/\/+$/, ''), privateKey: keyInput.value.trim() })
        void start()
    })

    const lastError = takeQuitMessage()
    if (lastError || !config.privateKey || !config.server) showForm(lastError)
    else void start()
}

if (isSubWindow) {
    document.getElementById('connect').remove()
    mountApp()
} else startTopPage()
