// 在普通浏览器中（如 Icalingua++ 网页版的子窗口）补上桌面版由 fileManagerPreload.js 注入的函数。
// 桌面版中 preload 先于本脚本执行，以下判断都不会生效。
;(function () {
    var hashParams = new URLSearchParams(location.hash.slice(1))
    if (window.isAdmin === undefined && hashParams.has('admin')) window.isAdmin = hashParams.get('admin')

    if (!window.download)
        window.download = function (url, name) {
            var a = document.createElement('a')
            a.href = url
            a.download = name || ''
            a.target = '_blank'
            a.rel = 'noopener'
            document.body.appendChild(a)
            a.click()
            a.remove()
        }

    if (!window.copyText)
        window.copyText = function (text) {
            return navigator.clipboard.writeText(text)
        }

    // 上传需要经 Icalingua++ 的主连接进行：把文件交给嵌入本页面的网页版，由它调用与桌面版相同的上传流程
    if (!window.uploadGroupFile && window.parent !== window) {
        var pending = {}
        window.addEventListener('message', function (e) {
            if (e.source !== window.parent || !e.data || !pending[e.data.requestId]) return
            var request = pending[e.data.requestId]
            if (e.data.type === 'icalingua:uploadProgress') request.onProgress && request.onProgress(e.data.progress)
            if (e.data.type === 'icalingua:uploadResult') {
                delete pending[e.data.requestId]
                if (e.data.ok) request.resolve({ ok: true })
                else request.reject(new Error(e.data.error || '群文件上传失败'))
            }
        })
        // 页面会先调用 webUtils.getPathForFile 取本地路径，这里直接把 File 对象当作 "路径" 传回来
        window.webUtils = window.webUtils || {
            getPathForFile: function (file) {
                return file
            },
        }
        window.uploadGroupFile = function (groupId, file, pid, fileName, onProgress) {
            var requestId = Date.now() + '-' + Math.random().toString(16).slice(2)
            return new Promise(function (resolve, reject) {
                pending[requestId] = { resolve: resolve, reject: reject, onProgress: onProgress }
                window.parent.postMessage(
                    { type: 'icalingua:uploadGroupFile', requestId: requestId, file: file, pid: pid, name: fileName },
                    '*',
                )
            })
        }
    }
})()
