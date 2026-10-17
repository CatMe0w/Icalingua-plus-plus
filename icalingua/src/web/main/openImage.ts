/** 替代 main/ipc/openImage.ts：在新标签页打开图片 */
export default (url: string) => window.open(url, '_blank', 'noopener')
