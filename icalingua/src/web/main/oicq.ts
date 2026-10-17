/** 替代 oicq-icalingua-plus-plus 的根入口：复用的主进程代码只在调试菜单里用到 pb */
import { unsupported } from './unsupported'

export const pb = {
    decode: unsupported('发送原始数据包'),
    encode: unsupported('发送原始数据包'),
}
