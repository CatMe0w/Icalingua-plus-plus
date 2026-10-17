/**
 * 网页版构建：复用渲染进程的 loader 配置，入口换成 src/web/main.ts，
 * 并把 electron / Node 内置模块替换成 src/web/shims 下的浏览器实现。
 *
 * 表情等静态资源由 build-web.ts 在编译后复制；设置 ICALINGUA_WEB_STATIC_URL 时
 * 页面从该地址（如 S3/CDN）加载它们，资源输出到 dist/web-static 供单独上传。
 */
import path from 'path'
import { Configuration, HtmlRspackPlugin, DefinePlugin, ProvidePlugin, RuleSetRule } from '@rspack/core'
import { VueLoaderPlugin } from 'vue-loader'
import rendererConfig from './rspack.renderer.config'

const isProduction = process.env.NODE_ENV === 'production'
const shims = path.join(__dirname, '../src/web/shims')
export const staticUrl = process.env.ICALINGUA_WEB_STATIC_URL || 'static'

// 网页版不打包微软雅黑（16MB），交给系统字体回退：css-loader 不再解析这个 url，打包时也就不会包含它
const withoutMsyh = (rule: RuleSetRule): RuleSetRule => {
    if (!Array.isArray(rule.use)) return rule
    return {
        ...rule,
        use: rule.use.map<any>((loader) =>
            loader === 'css-loader'
                ? { loader: 'css-loader', options: { url: { filter: (url: string) => !/msyh\.ttf$/.test(url) } } }
                : loader,
        ),
    } as RuleSetRule
}

const webConfig: Configuration = {
    devtool: isProduction ? false : 'cheap-module-source-map',
    entry: {
        web: path.join(__dirname, '../src/web/main.ts'),
    },
    module: {
        ...rendererConfig.module,
        rules: rendererConfig.module.rules.map((rule) => withoutMsyh(rule as RuleSetRule)),
    },
    plugins: [
        new VueLoaderPlugin() as any,
        new HtmlRspackPlugin({
            filename: 'index.html',
            template: path.resolve(__dirname, '../src/web/index.ejs'),
            minify: isProduction,
            templateParameters: { staticUrlJson: JSON.stringify(staticUrl) },
        }),
        new DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        }),
        new ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
            process: [path.join(shims, 'node.ts'), 'process'],
        }),
    ],
    output: {
        filename: '[name].[contenthash:8].js',
        path: path.join(__dirname, '../dist/web'),
        publicPath: 'auto',
        clean: true,
    },
    resolve: {
        alias: {
            '@': path.join(__dirname, '../src/renderer'),
            vue$: 'vue/dist/vue.esm.js',
            electron$: path.join(shims, 'electron.ts'),
            'vue-electron$': path.join(shims, 'node.ts'),
            fs$: path.join(shims, 'fs.ts'),
            os$: path.join(shims, 'node.ts'),
            crypto$: path.join(shims, 'node.ts'),
            path$: 'path-browserify',
        },
        extensions: ['.ts', '.js', '.vue', '.json', '.css'],
    },
    target: 'web',
    mode: isProduction ? 'production' : 'development',
}

export default webConfig
