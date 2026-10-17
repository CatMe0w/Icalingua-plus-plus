/**
 * 替代 @icalingua/storage-providers/SQLStorageProvider：网页版不做 bridge 本地数据库同步
 * （bridgeLocalDatabaseSync 恒为 false，socketIoAdapter 不会创建它）。
 */
export default class SQLStorageProvider {
    constructor() {
        throw new Error('网页版不支持本地数据库')
    }
}
