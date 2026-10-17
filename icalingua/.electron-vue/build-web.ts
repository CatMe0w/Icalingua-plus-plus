import fs from 'fs'
import path from 'path'
import { rspack } from '@rspack/core'
import sharp from 'sharp'

process.env.NODE_ENV = process.env.NODE_ENV || 'production'

// 必须在设置 NODE_ENV 之后再加载配置
const webConfig = require('./rspack.web.config').default

const staticDir = path.join(__dirname, '../static')

/**
 * 复制渲染进程会直接引用的静态资源（Electron 专用的 preload / 注入脚本不需要），
 * 生成表情清单（网页版无法列目录）和表情面板用的缩略图。
 */
const copyStaticAssets = async () => {
    const outDir = path.join(__dirname, '../dist/web/static')
    fs.mkdirSync(outDir, { recursive: true })
    for (const dir of ['face', 'qlottie']) {
        fs.cpSync(path.join(staticDir, dir), path.join(outDir, dir), { recursive: true })
    }
    for (const file of fs.readdirSync(staticDir)) {
        if (/\.(svg|wav|webp)$/.test(file)) fs.copyFileSync(path.join(staticDir, file), path.join(outDir, file))
    }
    const faces = fs.readdirSync(path.join(staticDir, 'face')).sort()
    fs.writeFileSync(path.join(outDir, 'face/index.json'), JSON.stringify(faces))
    // 原图多为 128px 动图，面板里只显示 32px；只取首帧缩到 64px，总量从约 60MB 降到约 1MB
    fs.mkdirSync(path.join(outDir, 'face-thumb'))
    await Promise.all(
        faces.map((face) =>
            sharp(path.join(staticDir, 'face', face), { pages: 1 })
                .resize(64, 64)
                .webp({ quality: 80 })
                .toFile(path.join(outDir, 'face-thumb', face + '.webp')),
        ),
    )
    console.log(`静态资源已输出到 ${outDir}`)
}

rspack(webConfig, (err, stats) => {
    if (err) {
        console.error(err.stack || err)
        process.exit(1)
    }
    console.log(stats?.toString({ chunks: false, colors: true, modules: false, assets: true }))
    if (stats?.hasErrors()) process.exit(1)
    copyStaticAssets().catch((e) => {
        console.error(e)
        process.exit(1)
    })
})
