import express from 'express'
import sendImgTokenManager from '../utils/sendImgTokenManager'
import type oicqAdapter from '../adapters/oicqAdapter'
import { json } from 'body-parser'
import { config } from './configManager'
import fs from 'fs'
import path from 'path'

export const app = express()
const parser = json({
    limit: '100mb',
})

const requireSendToken = (req, res, next) => {
    if (!sendImgTokenManager.verify(req.params.token)) {
        return res.sendStatus(403)
    }
    next()
}

export const initExpress = (adapter: typeof oicqAdapter) => {
    app.post('/api/:token/sendMessage', requireSendToken, parser, (req, res) => {
        adapter.sendMessage(req.body)
        res.sendStatus(202).end()
    })
}

const runtimeRoots = [path.resolve(__dirname, '..'), path.resolve(__dirname), require.main?.path, process.cwd()].filter(
    Boolean,
) as string[]
const runtimeRoot =
    runtimeRoots.find((root) => fs.existsSync(path.join(root, 'static', 'file-manager'))) ||
    runtimeRoots[0] ||
    process.cwd()

app.use('/file-manager', express.static(path.join(runtimeRoot, 'static', 'file-manager')))
app.use('/records', express.static(path.join(require.main ? require.main.path : process.cwd(), 'data', 'records')))
// 网页版客户端：默认不托管，路径由用户自定，避免被按常见路径扫描
const RESERVED_WEB_PATHS = ['api', 'file-manager', 'records', 'ping', 'socket.io']
const mountWebClient = () => {
    if (!config.webPath) return
    const webPath = config.webPath.replace(/\/+$/, '')
    const segment = webPath.slice(1)
    if (!/^\/[A-Za-z0-9._~-]+$/.test(webPath) || RESERVED_WEB_PATHS.includes(segment)) {
        console.error(`webPath 无效：${config.webPath}，应为单段路径（如 /a8f3k2...），且不能与已有路由重名`)
        return
    }
    const webDir = path.resolve(config.webDir || 'web')
    if (!fs.existsSync(path.join(webDir, 'index.html'))) {
        console.error(`未找到网页版客户端：${webDir}/index.html，请将 icalingua 的 pnpm build:web 产物放到该目录`)
        return
    }
    if (segment.length < 16) console.warn('webPath 较短，容易被扫描器猜到，建议使用 16 位以上的随机字符串')
    app.use(
        webPath,
        express.static(webDir, {
            setHeaders: (res, filePath) => {
                res.setHeader('X-Robots-Tag', 'noindex, nofollow')
                // index.html 引用带内容哈希的 JS，自身不缓存，其余资源长期缓存
                res.setHeader(
                    'Cache-Control',
                    path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=604800',
                )
            },
        }),
    )
    console.log(`网页版客户端已启用：${webPath}/ -> ${webDir}`)
}
mountWebClient()

app.get('/ping', (req, res) => {
    res.json({
        code: '200',
        status: 'success',
        data: 'pong',
    })
})
