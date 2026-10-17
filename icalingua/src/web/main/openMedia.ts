/** 替代 main/utils/openMedia.ts（桌面版用本地播放器打开视频、语音）：网页版在子窗口中播放 */
import { openVideo } from './downloadManager'

export default (url: string) => openVideo(url, decodeURIComponent(url.split('?')[0].split('/').pop() || ''))
