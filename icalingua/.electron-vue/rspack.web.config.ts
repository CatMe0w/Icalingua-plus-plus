/**
 * 网页版构建：复用渲染进程的 loader 配置，入口换成 src/web/main.ts，
 * 并把 electron / Node 内置模块替换成 src/web/shims 下的浏览器实现。
 */
import path from 'path'
import { Configuration, CopyRspackPlugin, HtmlRspackPlugin, DefinePlugin, ProvidePlugin } from '@rspack/core'
import { VueLoaderPlugin } from 'vue-loader'
import rendererConfig from './rspack.renderer.config'

const isProduction = process.env.NODE_ENV === 'production'
const shims = path.join(__dirname, '../src/web/shims')
const staticDir = path.join(__dirname, '../static')

const webConfig: Configuration = {
    devtool: isProduction ? false : 'cheap-module-source-map',
    entry: {
        web: path.join(__dirname, '../src/web/main.ts'),
    },
    module: rendererConfig.module,
    plugins: [
        new VueLoaderPlugin() as any,
        new HtmlRspackPlugin({
            filename: 'index.html',
            template: path.resolve(__dirname, '../src/web/index.ejs'),
            minify: isProduction,
        }),
        new CopyRspackPlugin({
            // 只复制渲染进程会直接引用的静态资源，Electron 专用的 preload / 注入脚本不需要
            patterns: [
                ...['face', 'qlottie'].map((dir) => ({ from: dir, context: staticDir, to: `static/${dir}` })),
                { from: '*.{svg,wav,webp}', context: staticDir, to: 'static' },
            ],
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
