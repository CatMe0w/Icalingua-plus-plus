/** 替代 main/utils/openMedia.ts：在新标签页打开 */
export default (url: string) => window.open(url, '_blank', 'noopener')
