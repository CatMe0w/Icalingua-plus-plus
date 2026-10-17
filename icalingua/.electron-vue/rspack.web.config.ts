/**
 * 网页版构建：复用渲染进程的 loader 配置，入口换成 src/web/main.ts，
 * 并把 electron / Node 内置模块替换成 src/web/shims 下的浏览器实现。
 *
 * 表情等静态资源由 build-web.ts 在编译后复制到 dist/web/static。
 */
import path from 'path'
import {
    Configuration,
    HtmlRspackPlugin,
    DefinePlugin,
    NormalModuleReplacementPlugin,
    ProvidePlugin,
    RuleSetRule,
} from '@rspack/core'
import { VueLoaderPlugin } from 'vue-loader'
import rendererConfig from './rspack.renderer.config'

const isProduction = process.env.NODE_ENV === 'production'
const src = path.join(__dirname, '../src')
const shims = path.join(src, 'web/shims')

/**
 * 网页版直接复用桌面版的主进程代码（socketIoAdapter、botAndStorage、system、menuManager、ui、themes 等），
 * 其依赖的、只能在桌面环境运行的模块替换为 src/web/main 下的实现。键为相对 src 的模块路径。
 */
const MAIN_MODULE_REPLACEMENTS: Record<string, string> = {
    'main/adapters/oicqAdapter': 'emptyAdapter',
    'main/adapters/readOnlyAdapter': 'emptyAdapter',
    'main/ipc/downloadManager': 'downloadManager',
    'main/ipc/openImage': 'openImage',
    'main/utils/avatarCache': 'avatarCache',
    'main/utils/configManager': 'configManager',
    'main/utils/errorHandler': 'errorHandler',
    'main/utils/exit': 'exit',
    'main/utils/exportContacts': 'exportContacts',
    'main/utils/exportGroupMembers': 'exportGroupMembers',
    'main/utils/groupWebApps': 'groupWebApps',
    'main/utils/isInlineReplySupported': 'isInlineReplySupported',
    'main/utils/noctaliaServer': 'noctaliaServer',
    'main/utils/openMedia': 'openMedia',
    'main/utils/silkEncode': 'silkEncode',
    'main/utils/trayManager': 'trayManager',
    'main/utils/updateChecker': 'updateChecker',
    'main/utils/version': 'version',
    'main/utils/windowManager': 'windowManager',
    'utils/IcalinguaWindow': 'IcalinguaWindow',
    'utils/getWinUrl': 'getWinUrl',
}
const replacementTargets = new Map(
    Object.entries(MAIN_MODULE_REPLACEMENTS).map(([mod, target]) => [
        path.join(src, mod),
        path.join(src, 'web/main', target),
    ]),
)

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
        }),
        new DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        }),
        new NormalModuleReplacementPlugin(/^\.\.?\//, (resolveData) => {
            const target = replacementTargets.get(path.resolve(resolveData.context, resolveData.request))
            if (target) resolveData.request = target
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
            querystring$: path.join(shims, 'querystring.ts'),
            'oicq-icalingua-plus-plus$': path.join(src, 'web/main/oicq.ts'),
            '@icalingua/storage-providers/SQLStorageProvider$': path.join(shims, 'sqlStorageProvider.ts'),
            'file-type$': path.join(shims, 'fileType.ts'),
            'freedesktop-notifications$': path.join(shims, 'freedesktopNotifications.ts'),
            systeminformation$: path.join(shims, 'systeminformation.ts'),
        },
        extensions: ['.ts', '.js', '.vue', '.json', '.css'],
    },
    target: 'web',
    mode: isProduction ? 'production' : 'development',
}

export default webConfig
