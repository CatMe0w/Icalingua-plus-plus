/**
 * 网页版配置：存在 localStorage 中。默认值照抄 main/utils/configManager.ts 的 defaultConfig，
 * 只是 adapter 固定为 socketIo。页面通常与 bridge 不同源（如部署在 S3），server 需要用户首次填写。
 */
import AllConfig from '@icalingua/types/AllConfig'

const STORAGE_KEY = 'icalingua-web-config'

const defaultConfig: AllConfig = {
    privateKey: '',
    server: '',
    account: {
        mdbConnStr: 'mongodb://localhost',
        rdsHost: '127.0.0.1',
        storageType: 'sqlite',
        sqlHost: '127.0.0.1',
        sqlUsername: '',
        sqlPassword: '',
        sqlDatabase: '',
        username: '',
        password: '',
        protocol: 2,
        autologin: false,
    },
    priority: 3,
    aria2: {
        enabled: false,
        slient: false,
        host: '127.0.0.1',
        port: 6800,
        secure: false,
        allowSelfSigned: false,
        secret: '',
        path: '/jsonrpc',
    },
    darkTaskIcon: 'auto',
    winSize: { width: 1200, height: 800, max: false },
    socketIo: '',
    adapter: 'socketIo',
    fetchHistoryOnChatOpen: false,
    lastUsedStickerType: 'remote',
    keyToSendMessage: 'Enter',
    clearRoomsBehavior: 'disabled',
    theme: 'auto',
    updateCheck: false,
    disableBridgeVersionCheck: false,
    shortcuts: {},
    zoomFactor: 100,
    debugmode: false,
    anonymous: false,
    linkify: true,
    roomPanelAvatarOnly: false,
    roomPanelWidth: null,
    sendRawMessage: false,
    custom: false,
    fetchHistoryOnStart: false,
    showAppMenu: false,
    optimizeMethod: 'infinite-loading',
    silentFetchHistory: false,
    hideChatImageByDefault: false,
    hideChatVideoByDefault: false,
    disableChatGroups: false,
    singleImageMode: false,
    disableChatGroupsRedPoint: false,
    countAtAllInChatGroups: true,
    localImageViewerByDefault: false,
    disableQLottie: false,
    disableNotification: false,
    lockPassword: '',
    useSinglePanel: false,
    disableAtAll: false,
    removeGroupNameEmotes: false,
    usePanguJsSend: false,
    usePanguJsRecv: false,
    descSortStickersByTime: true,
    sortRoomsByPriority: false,
    sendSilkAudio: false,
    disableChooseFileType: true,
    disableImgViewTouchPad: false,
    externalGfsBrowser: '',
    imageViewerSize: { width: 800, height: 600, max: false },
    hideTray: true,
    hideTitleBar: true,
    disableQuitShortcut: true,
    stickerPanelBottom: false,
    stickerPanelHeight: 320,
    compressImages: false,
    bridgeLocalDatabaseSync: false,
    downloadPath: '',
}

let config: AllConfig

const load = (): AllConfig => {
    let saved: Partial<AllConfig> = {}
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    } catch (e) {
        console.warn('[web] 读取配置失败，使用默认配置', e)
    }
    return { ...defaultConfig, ...saved, adapter: 'socketIo' }
}

export const getConfig = (): AllConfig => {
    if (!config) config = load()
    return config
}

export const saveConfig = () => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getConfig()))
    } catch (e) {
        console.warn('[web] 保存配置失败', e)
    }
}

export const updateConfig = (patch: Partial<AllConfig>) => {
    Object.assign(getConfig(), patch)
    saveConfig()
    return getConfig()
}
