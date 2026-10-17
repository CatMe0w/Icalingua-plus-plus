/** 替代 main/utils/groupWebApps.ts：这些页面需要给 qq.com 设置 cookie，浏览器中无法实现 */
import { unsupported } from './unsupported'

export const openGroupAnnouncements = unsupported('群公告')
export const openGroupFiles = unsupported('群文件')
export const openGroupAlbum = unsupported('群相册')
export const openGroupEssence = unsupported('群精华消息')
