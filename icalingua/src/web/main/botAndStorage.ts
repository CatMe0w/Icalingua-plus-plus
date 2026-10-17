/**
 * 替代 main/ipc/botAndStorage.ts：把复用的主进程代码（menuManager 等）对 adapter 的调用转给 web/bridge.ts。
 */
import { adapter } from '../bridge'

export const {
    sendMessage,
    clearRoomUnread,
    getUin,
    getNickname,
    getRoom,
    getSelectedRoom,
    getUnreadCount,
    getDisabledFeatures,
    getFriend,
    getGroup,
    getGroups,
    getGroupMembers,
    getGroupMemberInfo,
    getFriendsFallback,
    getMsgNewURL,
    getGroupFileMeta,
    getPrivateFileUrl,
    requestGfsToken,
    sendPacket,
    deleteMessage,
    hideMessage,
    revealMessage,
    renewMessage,
    renewMessageURL,
    fetchHistory,
    fetch7DaysHistory,
    ignoreChat,
    makeForward,
    markRoomUnread,
    markMessageUnread,
    pinRoom,
    removeChat,
    setOnlineStatus,
    setRoomPriority,
    setRoomAutoDownload,
    setRoomAutoDownloadPath,
    sendGroupSign,
    sendGroupPoke,
} = adapter

// 以下与 main/ipc/botAndStorage.ts 中的同名函数一致
export const fetchLatestHistory = (roomId: number) => {
    let buffer: Buffer
    let uid = roomId
    if (roomId < 0) {
        buffer = Buffer.alloc(21)
        uid = -uid
    } else buffer = Buffer.alloc(17)
    buffer.writeUInt32BE(uid, 0)
    fetchHistory(buffer.toString('base64'), roomId)
}

export const getCookies = async (domain: string) => {
    const strCookies = await adapter.getCookies(domain)
    return Object.fromEntries(strCookies.split('; ').map((pair) => pair.replace(/;$/, '').split('=')))
}
