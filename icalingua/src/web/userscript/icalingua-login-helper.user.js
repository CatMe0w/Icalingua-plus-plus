// ==UserScript==
// @name         Icalingua++ 网页版登录辅助
// @namespace    https://github.com/Icalingua-plus-plus/Icalingua-plus-plus
// @version      1.0.0
// @description  在 Icalingua++ 网页版打开的 QQ 滑块验证、设备锁验证页面中，把验证结果交回网页版。作用与桌面版注入的 sliderinj.js 和设备信息相同。
// @match        https://*.qq.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

;(function () {
    // 只处理由 Icalingua++ 网页版打开的标签页
    var opener = window.opener
    if (!opener) return

    // 滑块验证码：验证页把结果写进 jsbridge:// 地址（手机 QQ 由此取得结果），截获后交给网页版解析
    var prefix = 'jsbridge://CAPTCHA/onVerifyCAPTCHA?p='
    function report(url) {
        if (typeof url !== 'string' || url.indexOf(prefix) !== 0) return false
        opener.postMessage({ type: 'icalingua:sliderTicket', ticket: url }, '*')
        setTimeout(function () {
            window.close()
        }, 300)
        return true
    }
    ;[HTMLImageElement.prototype, HTMLIFrameElement.prototype].forEach(function (proto) {
        var desc = Object.getOwnPropertyDescriptor(proto, 'src')
        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: desc.enumerable,
            get: desc.get,
            set: function (value) {
                if (report(value)) return
                desc.set.call(this, value)
            },
        })
    })

    // 设备锁验证：向网页版要设备信息，页面加载完成后写入页面状态（桌面版在同一时机注入同样的内容）
    var deviceInfo = null
    var loaded = false
    function applyDeviceInfo() {
        if (deviceInfo && window.__INITIAL_STATE__) window.__INITIAL_STATE__.deviceInfo = deviceInfo
    }
    window.addEventListener('message', function (e) {
        if (e.source !== opener || !e.data || e.data.type !== 'icalingua:deviceInfo') return
        deviceInfo = e.data.deviceInfo
        if (loaded) applyDeviceInfo()
    })
    window.addEventListener('load', function () {
        loaded = true
        applyDeviceInfo()
    })
    opener.postMessage({ type: 'icalingua:hello' }, '*')
})()
