import { rspack } from '@rspack/core'

process.env.NODE_ENV = process.env.NODE_ENV || 'production'

// 必须在设置 NODE_ENV 之后再加载配置
const webConfig = require('./rspack.web.config').default

rspack(webConfig, (err, stats) => {
    if (err) {
        console.error(err.stack || err)
        process.exit(1)
    }
    console.log(stats?.toString({ chunks: false, colors: true, modules: false, assets: true }))
    if (stats?.hasErrors()) process.exit(1)
})
