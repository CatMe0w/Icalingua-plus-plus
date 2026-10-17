/** 替代 main/utils/silkEncode.ts：网页版没有本地编码器，发送普通语音 */
export default async (_path: string): Promise<string> => {
    throw new Error('网页版不支持 SILK 编码')
}
