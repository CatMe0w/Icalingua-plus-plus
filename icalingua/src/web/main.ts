/**
 * 网页版入口。先显示连接表单，鉴权成功并收到 onlineData 后再挂载与 Electron 版相同的 Vue 应用。
 */
import Vue from 'vue'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import App from '../renderer/App.vue'
import router from '../renderer/router'
import { connect } from './bridge'
import { getConfig, updateConfig } from './config'

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

const start = () => {
    submitButton.disabled = true
    errorBox.textContent = '正在连接…'
    connect({
        onReady() {
            document.getElementById('connect').hidden = true
            Vue.config.productionTip = false
            Vue.use(ElementUI)
            new Vue({
                components: { App },
                router,
                template: '<App/>',
            }).$mount('#app')
            if (router.currentRoute.path !== '/main') router.replace('/main')
        },
        onFatal(message) {
            // 鉴权状态散落在 socket 和已注册的处理函数里，失败后整页重载最简单可靠
            sessionStorage.setItem('icalingua-web-error', message)
            location.reload()
        },
    })
}

const config = getConfig()
serverInput.value = config.server
keyInput.value = config.privateKey

form.addEventListener('submit', (e) => {
    e.preventDefault()
    updateConfig({ server: serverInput.value.replace(/\/+$/, ''), privateKey: keyInput.value.trim() })
    start()
})

const lastError = sessionStorage.getItem('icalingua-web-error')
sessionStorage.removeItem('icalingua-web-error')
if (lastError || !config.privateKey) showForm(lastError)
else start()
