/**
 * 网页版的 "主进程"：把 main/adapters/socketIoAdapter.ts 和 main/ipc/* 中 bridge 模式实际用到的部分
 * 搬到浏览器里，直接用 socket.io 连 bridge，再通过 ipcBus 与渲染进程代码对接。
 *
 * 只覆盖网页版需要的通道，其余通道由 ipcBus 打印 "未实现" 警告。
 * 下方导出的 adapter 供 web/main/botAndStorage.ts 使用，从而让 menuManager.ts 等主进程代码直接复用。
 */
import BridgeVersionInfo from '@icalingua/types/BridgeVersionInfo'
import ChatGroup from '@icalingua/types/ChatGroup'
import DatabaseUpgradeProgress from '@icalingua/types/DatabaseUpgradeProgress'
import Message from '@icalingua/types/Message'
import MessagePageOptions from '@icalingua/types/MessagePage'
import Room from '@icalingua/types/Room'
import SpecialFeature from '@icalingua/types/SpecialFeature'
import { sign } from '@noble/ed25519'
import { io, Socket } from 'socket.io-client'
import { version } from '../../package.json'
import getAvatarUrl from '../utils/getAvatarUrl'
import { getConfig, saveConfig, updateConfig } from './config'
import { emitToRenderer, ipcMain } from './ipcBus'

// 与 main/adapters/socketIoAdapter.ts 保持一致
const EXCEPTED_PROTOCOL_VERSION = '2.26.7'

let socket: Socket
let uin = 0
let nickname = ''
let rooms: Room[] = []
let chatGroups: ChatGroup[] = []
let cachedOnlineData: any
let versionInfo: BridgeVersionInfo
let disabledFeatures: SpecialFeature[]
let selectedRoomId = 0
let dbUpgradeProgress: DatabaseUpgradeProgress = { active: false, step: 0, total: 0, message: '' }
let atCache: any[] = []
let currentLoadedMessagesCount = 0

export interface ConnectCallbacks {
    /** 鉴权通过且 bridge 已登录 QQ，第一次收到 onlineData 时调用 */
    onReady: () => void
    /** 连接或鉴权失败，界面应回到连接表单 */
    onFatal: (message: string) => void
}

const isPageActive = () => document.visibilityState === 'visible' && document.hasFocus()

const call = <T = any>(channel: string, ...args: any[]): Promise<T> =>
    new Promise((resolve) => socket.emit(channel, ...args, resolve))

// region bridge → 页面
const attachSocketEvents = (callbacks: ConnectCallbacks) => {
    let ready = false
    socket.on('connect_error', (e) => emitToRenderer('setOffline', `与服务器连接断开：${e.message}`))
    socket.on('connect', () => emitToRenderer('setOnline'))
    socket.on('dbUpgradeProgress', (progress: DatabaseUpgradeProgress) => {
        dbUpgradeProgress = progress
        emitToRenderer('dbUpgradeProgress', progress)
    })
    socket.on('updateRoom', (room: Room) => {
        if (room.roomId === selectedRoomId && isPageActive()) {
            room.unreadCount = 0
            room.at = false
            room.atMessageId = null
            clearRoomUnread(room.roomId)
        }
        emitToRenderer('updateRoom', room)
        const local = rooms.find((e) => e.roomId === room.roomId)
        if (local) Object.assign(local, room)
        updateTitle()
    })
    socket.on('addMessage', ({ roomId, message }: { roomId: number; message: Message }) => {
        if (roomId !== selectedRoomId) return
        emitToRenderer('addMessage', { roomId, message })
        if (typeof message._id === 'string' && isPageActive()) socket.emit('reportRead', message._id)
    })
    socket.on('deleteMessage', (messageId: string | number) => emitToRenderer('deleteMessage', messageId))
    socket.on('setOnline', () => emitToRenderer('setOnline'))
    socket.on('setOffline', (message: string) => emitToRenderer('setOffline', message))
    socket.on('onlineData', (data: { online: boolean; nick: string; uin: number; sysInfo: string; bkn: number }) => {
        uin = data.uin
        nickname = data.nick
        cachedOnlineData = {
            ...data,
            priority: getConfig().priority,
            serverInfo: data.sysInfo,
            updateCheck: false,
        }
        if (!ready) {
            ready = true
            callbacks.onReady()
        }
        sendOnlineData()
    })
    socket.on('setShutUp', (isShutUp: boolean) => emitToRenderer('setShutUp', isShutUp))
    for (const channel of [
        'message',
        'messageError',
        'messageSuccess',
        'addMessageText',
        'closeLoading',
        'notifyError',
    ])
        socket.on(channel, (data) => emitToRenderer(channel, data))
    socket.on('notifyMessage', (data) => emitToRenderer('notify', data))
    socket.on('setAllRooms', (serverRooms: Room[] = []) => {
        rooms = serverRooms
        emitToRenderer('setAllRooms', rooms)
        updateTitle()
    })
    socket.on('setAllChatGroups', (serverChatGroups: ChatGroup[] = []) => {
        chatGroups = serverChatGroups
        emitToRenderer('setAllChatGroups', chatGroups)
    })
    socket.on('renewMessage', (data) => emitToRenderer('renewMessage', data))
    socket.on('renewMessageURL', (data) => emitToRenderer('renewMessageURL', data))
    socket.on('syncRead', (roomId: number) => emitToRenderer('clearRoomUnread', roomId))
    socket.on('setMessages', ({ roomId, messages }: { roomId: number; messages: Message[] }) => {
        if (roomId === selectedRoomId) emitToRenderer('setMessages', messages)
    })
    socket.on('notify', showNotification)
    socket.on('requestSetup', () =>
        callbacks.onFatal('Bridge 尚未登录 QQ。网页版暂不支持登录流程，请先用桌面客户端或 bridge 自身完成登录。'),
    )
    socket.on('fatal', (message: string) => {
        socket.disconnect()
        callbacks.onFatal('服务端错误：' + message)
    })
    for (const channel of ['login-verify', 'login-qrcodeLogin', 'login-smsCodeVerify', 'login-error', 'login-slider'])
        socket.on(channel, () => emitToRenderer('messageError', `网页版暂不支持登录验证（${channel}）`))
}

const showNotification = async (data: {
    priority: 1 | 2 | 3 | 4 | 5
    roomId: number
    at: string | boolean
    data: { title: string; body: string }
    isSelfMsg: boolean
}) => {
    const config = getConfig()
    if (data.isSelfMsg || config.disableNotification) return
    if (isPageActive() && data.roomId === selectedRoomId) return
    if (!(data.priority >= config.priority || data.at === true || (data.at && !config.disableAtAll))) return
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission !== 'granted') return
    const notif = new Notification(data.data.title, {
        body: data.data.body,
        icon: getAvatarUrl(data.roomId, true),
        tag: String(data.roomId),
    })
    notif.onclick = () => {
        window.focus()
        emitToRenderer('chroom', data.roomId)
        notif.close()
    }
}

const updateTitle = () => {
    const unread = rooms.filter((e) => e.unreadCount && e.priority >= getConfig().priority).length
    document.title = (unread ? `(${unread}) ` : '') + (nickname ? `${nickname} - ` : '') + 'Icalingua++ Web'
}
// endregion

// region 页面 → bridge
const sendOnlineData = () => {
    if (!cachedOnlineData) return
    cachedOnlineData.sysInfo = `Icalingua++ Web ${version}\n\n${cachedOnlineData.serverInfo}`
    emitToRenderer('gotOnlineData', cachedOnlineData)
    emitToRenderer('setAllRooms', rooms)
    emitToRenderer('setAllChatGroups', chatGroups)
    updateTitle()
}

const updateRoom = (roomId: number, room: Partial<Room>) => {
    const local = rooms.find((e) => e.roomId === roomId)
    if (local) Object.assign(local, room)
    socket.emit('updateRoom', roomId, room)
}

const clearRoomUnread = (roomId: number) => {
    if (!socket) return
    emitToRenderer('clearRoomUnread', roomId)
    updateRoom(roomId, { unreadCount: 0, at: false, atMessageId: null })
    updateTitle()
}

const sendMessage = (data: any) => {
    if (!data.roomId && !data.room) data.roomId = selectedRoomId
    const viaHttp = (data.file && data.file.type?.startsWith('audio/')) || data.media?.some((i) => i.b64)
    if (viaHttp) {
        // 图片/语音走 bridge 的 HTTP 接口（与 Electron 版相同），要求页面与 bridge 同源或 bridge 开启 CORS
        socket.emit('requestToken', async (token: string) => {
            try {
                const res = await fetch(`${getConfig().server}/api/${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                })
                if (res.status === 413) emitToRenderer('messageError', '文件过大，无法发送')
                else if (!res.ok) emitToRenderer('messageError', `上传失败：HTTP ${res.status}`)
            } catch (e) {
                console.error(e)
                emitToRenderer('messageError', '上传失败：' + e.message)
            }
        })
        return
    }
    if (data.file) {
        // 普通文件需要分块上传到 bridge，最小验证版本暂不实现
        emitToRenderer('messageError', '网页版暂不支持发送文件')
        return
    }
    socket.emit('sendMessage', data)
}

const registerHandlers = () => {
    // 设置与环境
    ipcMain.handle('getSettings', () => getConfig())
    ipcMain.handle('updateSettings', (_, patch) => updateConfig(patch))
    ipcMain.handle('getStorePath', () => '')
    ipcMain.handle('getVersion', () => version)
    ipcMain.handle('getBuildInfo', () => ({ version, isProduction: process.env.NODE_ENV === 'production' }))
    ipcMain.handle('getDbUpgradeProgress', () => dbUpgradeProgress)
    ipcMain.handle('getKeyToSendMessage', () => getConfig().keyToSendMessage)
    ipcMain.handle('getClearRoomsBehavior', () => getConfig().clearRoomsBehavior)
    ipcMain.handle('getRoomPanelSetting', () => ({
        roomPanelAvatarOnly: getConfig().roomPanelAvatarOnly,
        roomPanelWidth: getConfig().roomPanelWidth,
    }))
    ipcMain.on('setRoomPanelSetting', (_, roomPanelAvatarOnly: boolean, roomPanelWidth: number) =>
        updateConfig({ roomPanelAvatarOnly, roomPanelWidth }),
    )
    ipcMain.handle('getMessgeTypeSetting', () => {
        let messageType = 'text'
        if (getConfig().anonymous) messageType = 'anonymous'
        if (getConfig().sendRawMessage) messageType = getConfig().debugmode ? 'raw' : messageType
        return messageType
    })
    ipcMain.handle('getLastUsedStickerType', () => getConfig().lastUsedStickerType)
    ipcMain.on('setLastUsedStickerType', (_, type) => updateConfig({ lastUsedStickerType: type }))
    ipcMain.on('setStickerPanelHeight', (_, height: number) => updateConfig({ stickerPanelHeight: height }))
    ipcMain.handle('getPriority', () => getConfig().priority)
    ipcMain.on('theme:list-complete', () => {
        const theme = getConfig().theme
        const dark = matchMedia('(prefers-color-scheme: dark)').matches
        emitToRenderer('theme:use', theme === 'auto' ? (dark ? 'dark' : 'light') : theme)
    })
    ipcMain.on('theme:theme-data', () => {})
    ipcMain.on('theme:set-complete', () => {})

    // 账号与状态
    ipcMain.handle('isOnline', () => socket?.connected)
    ipcMain.handle('getUin', () => uin)
    ipcMain.handle('getNick', () => nickname)
    ipcMain.handle('getAccount', () => getConfig().account)
    ipcMain.handle('getDisabledFeatures', async () => {
        if (!disabledFeatures) disabledFeatures = await call('getDisabledFeatures')
        return disabledFeatures
    })
    ipcMain.on('requestOnlineData', sendOnlineData)
    ipcMain.on('setSelectedRoom', (_, id: number) => {
        selectedRoomId = id
    })
    ipcMain.on('reLogin', () => {
        if (socket.disconnected) socket.connect()
        else socket.emit('reLogin')
    })

    // 会话
    ipcMain.on('updateRoom', (_, roomId: number, room: Partial<Room>) => updateRoom(roomId, room))
    ipcMain.on('addRoom', (_, room: Room) => {
        rooms.unshift(room)
        socket.emit('addRoom', room)
    })
    ipcMain.on('updateChatGroup', (_, name: string, chatGroup: ChatGroup) => {
        const local = chatGroups.find((e) => e.name === name)
        if (local) Object.assign(local, chatGroup)
        socket.emit('updateChatGroup', name, chatGroup)
    })
    ipcMain.on('removeChat', (_, roomId: number) => {
        socket.emit('removeChat', roomId)
        emitToRenderer('chroom', 0)
    })
    ipcMain.on('clearChatWindowUnread', (_, roomId: number) => clearRoomUnread(roomId))
    ipcMain.handle('getRoomInfo', (_, roomId: number) => rooms.find((e) => e.roomId === roomId))
    ipcMain.handle('isRoomInChatWindow', () => false)
    ipcMain.handle('getIgnoredChats', () => call('getIgnoredChats'))
    ipcMain.on('ignoreChat', (_, data) => socket.emit('ignoreChat', data))

    // 消息
    ipcMain.handle('fetchMessage', (_, { roomId, options }: { roomId: number; options: MessagePageOptions }) => {
        const initialPage = !options?.before && !options?.after
        if (initialPage && selectedRoomId) clearRoomUnread(selectedRoomId)
        return call<Message[]>('fetchMessages', roomId, options || {}).then((messages) => {
            if (initialPage) currentLoadedMessagesCount = messages.length
            else if (options?.before) currentLoadedMessagesCount += messages.length
            return messages
        })
    })
    ipcMain.handle('fetchMessagesAround', (_, { roomId, messageId, before, after }) =>
        call('fetchMessagesAround', roomId, messageId, before, after),
    )
    ipcMain.handle('fetchImageMessages', (_, { roomId, offset, endTime }) =>
        call('fetchImageMessages', roomId, offset, endTime),
    )
    ipcMain.handle('resolveUnreadTargetMessageId', (_, { roomId, unreadCount }) =>
        call('resolveUnreadTargetMessageId', roomId, unreadCount),
    )
    ipcMain.on('sendMessage', (_, data) => {
        data.at = atCache
        atCache = []
        sendMessage(data)
    })
    ipcMain.handle('pushAtCache', (_, at) => atCache.push(at))
    ipcMain.on('deleteMessage', (_, roomId: number, messageId: string) =>
        socket.emit('deleteMessage', roomId, messageId),
    )
    ipcMain.handle('updateMessage', (_, roomId: number, messageId: string, message: object) =>
        socket.emit('updateMessage', roomId, messageId, message),
    )
    ipcMain.on('stopFetchMessage', () => socket.emit('stopFetchingHistory'))
    ipcMain.on('sendGroupPoke', (_, gin: number, target: number) => socket.emit('sendGroupPoke', gin, target))
    ipcMain.handle('getNTPicURLbyFileid', (_, fileId: string, appid: string) =>
        Promise.race([call<string>('getNTPicURLbyFileid', fileId, appid), new Promise((r) => setTimeout(r, 5000, ''))]),
    )
    ipcMain.handle('getRoamingStamp', (_, noCache?: boolean) => call('getRoamingStamp', noCache))

    // 联系人与群
    ipcMain.handle('getFriend', (_, id: number) => call('getFriend', id))
    ipcMain.handle('getGroup', (_, gin: number) => call('getGroup', gin))
    ipcMain.handle('getGroupMembers', (_, gin: number) => call('getGroupMembers', gin))
    ipcMain.handle('getGroups', () => call('getGroups'))
    ipcMain.handle('getFriendsAndGroups', async () => ({
        groups: await call('getGroups'),
        friends: null,
        friendsFallback: await call('getFriendsFallback'),
    }))

    // 打开链接
    ipcMain.on('openImage', (_, url: string) => window.open(url, '_blank', 'noopener'))
    ipcMain.on('downloadImage', (_, url: string) => window.open(url, '_blank', 'noopener'))
}
// endregion

/**
 * 与 main/adapters/socketIoAdapter.ts 对应的操作，供 web/main/botAndStorage.ts 导出给复用的主进程代码。
 * 行为与 socketIoAdapter 保持一致（不含本地数据库同步）。
 */
export const adapter = {
    sendMessage,
    clearRoomUnread,
    getUin: () => uin,
    getNickname: () => nickname,
    getSelectedRoomId: () => selectedRoomId,
    getRoom: async (roomId: number) => rooms.find((e) => e.roomId === roomId),
    getSelectedRoom: async () => rooms.find((e) => e.roomId === selectedRoomId),
    getUnreadCount: async () => rooms.filter((e) => e.unreadCount && e.priority >= getConfig().priority).length,
    getDisabledFeatures: async (): Promise<SpecialFeature[]> => {
        if (!disabledFeatures) disabledFeatures = await call('getDisabledFeatures')
        return disabledFeatures
    },
    getFriend: (id: number) => call('getFriend', id),
    getGroup: (gin: number) => call('getGroup', gin),
    getGroups: () => call('getGroups'),
    getGroupMembers: (gin: number) => call('getGroupMembers', gin),
    getGroupMemberInfo: (group: number, member: number, noCache = true) =>
        call('getGroupMemberInfo', group, member, noCache),
    getFriendsFallback: () => call('getFriendsFallback'),
    getCookies: (domain: string) => call<string>('getCookies', domain),
    getMsgNewURL: (id: string) => call<string>('getMsgNewURL', id),
    getGroupFileMeta: (gin: number, fid: string) => call('getGroupFileMeta', gin, fid),
    getPrivateFileUrl: (fileId: string) => call<string>('getPrivateFileUrl', fileId),
    requestGfsToken: (gin: number) => call<string>('requestGfsToken', gin),
    sendPacket: (type: string, cmd: string, body: object) => call('sendPacket', type, cmd, body),
    deleteMessage: (roomId: number, messageId: string) => socket.emit('deleteMessage', roomId, messageId),
    hideMessage: (roomId: number, messageId: string) => {
        emitToRenderer('hideMessage', messageId)
        socket.emit('hideMessage', roomId, messageId)
    },
    revealMessage: (roomId: number, messageId: string | number) => {
        emitToRenderer('revealMessage', messageId)
        socket.emit('revealMessage', roomId, messageId)
    },
    renewMessage: (roomId: number, messageId: string, message: Message) =>
        socket.emit('renewMessage', roomId, messageId, message),
    renewMessageURL: (roomId: number, messageId: string | number, URL: string) =>
        socket.emit('renewMessageURL', roomId, messageId, URL),
    fetchHistory: (messageId: string, roomId = selectedRoomId) =>
        socket.emit('fetchHistory', messageId, roomId, currentLoadedMessagesCount),
    fetch7DaysHistory: () => socket.emit('fetch7DaysHistory'),
    ignoreChat: (data) => socket.emit('ignoreChat', data),
    makeForward: (fakes, dm?: boolean, origin?: number, target?: number) =>
        socket.emit('makeForward', fakes, dm, origin, target),
    markRoomUnread: (roomId: number) => {
        const room = rooms.find((e) => e.roomId === roomId)
        if (!room) return
        room.unreadCount = Math.max(room.unreadCount || 0, 1)
        room.at = false
        room.atMessageId = null
        emitToRenderer('updateRoom', room)
        updateRoom(roomId, { unreadCount: room.unreadCount, at: false, atMessageId: null })
        updateTitle()
    },
    markMessageUnread: (roomId: number, messageId: string) =>
        socket.emit('markMessageUnread', roomId, messageId, (unreadCount: number) => {
            const count = Math.max(0, Math.trunc(Number(unreadCount) || 0))
            const room = rooms.find((e) => e.roomId === roomId)
            if (!count || !room) return
            Object.assign(room, { unreadCount: count, at: false, atMessageId: null })
            emitToRenderer('updateRoom', room)
            updateTitle()
        }),
    pinRoom: (roomId: number, pin: boolean) => socket.emit('pinRoom', roomId, pin),
    removeChat: (roomId: number) => {
        socket.emit('removeChat', roomId)
        emitToRenderer('chroom', 0)
    },
    setOnlineStatus: (status: number) => socket.emit('setOnlineStatus', status),
    setRoomPriority: (roomId: number, priority: number) => socket.emit('setRoomPriority', roomId, priority),
    setRoomAutoDownload: (roomId: number, autoDownload: boolean) =>
        socket.emit('setRoomAutoDownload', roomId, autoDownload),
    setRoomAutoDownloadPath: (roomId: number, downloadPath: string) =>
        socket.emit('setRoomAutoDownloadPath', roomId, downloadPath),
    sendGroupSign: (gin: number) => socket.emit('sendGroupSign', gin),
    sendGroupPoke: (gin: number, target: number) => socket.emit('sendGroupPoke', gin, target),
}

/** 连接 bridge 并完成 Ed25519 挑战鉴权 */
export const connect = (callbacks: ConnectCallbacks) => {
    const config = getConfig()
    registerHandlers()
    saveConfig()
    socket = io(config.server, { transports: ['websocket'] })

    let authed = false
    socket.once('connect_error', (e) => {
        if (!authed) callbacks.onFatal('连接失败：' + (e?.message || e))
    })
    socket.on('requireAuth', async (salt: string, info: BridgeVersionInfo) => {
        versionInfo = info
        if (
            info.protocolVersion !== EXCEPTED_PROTOCOL_VERSION &&
            !config.disableBridgeVersionCheck &&
            !confirm(
                `当前版本的 Icalingua++ 要求 Bridge 的协议版本为 ${EXCEPTED_PROTOCOL_VERSION}，` +
                    `而服务器的协议版本为 ${info.protocolVersion}。是否继续？`,
            )
        ) {
            socket.disconnect()
            callbacks.onFatal('已取消：Bridge 协议版本不匹配')
            return
        }
        // 浏览器中 @noble/ed25519 依赖 crypto.subtle，只在安全上下文（HTTPS 或 localhost）可用
        socket.emit('auth', await sign(salt, config.privateKey))
    })
    socket.once('authSucceed', () => {
        authed = true
        console.log('[web] 鉴权成功，bridge 版本', versionInfo)
        attachSocketEvents(callbacks)
    })
    socket.on('authFailed', () => {
        socket.disconnect()
        callbacks.onFatal('认证失败：私钥与 bridge 配置的公钥不匹配')
    })
}
