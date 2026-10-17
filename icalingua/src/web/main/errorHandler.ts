/** 替代 main/utils/errorHandler.ts：网页版没有日志文件，输出到控制台 */
export default (e: unknown, _protected = false) => console.error(e)
