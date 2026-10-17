/** 替代 file-type：只识别网页版可能遇到的几种图片格式 */
const SIGNATURES: [number[], string, string][] = [
    [[0x89, 0x50, 0x4e, 0x47], 'png', 'image/png'],
    [[0xff, 0xd8, 0xff], 'jpg', 'image/jpeg'],
    [[0x47, 0x49, 0x46, 0x38], 'gif', 'image/gif'],
    [[0x52, 0x49, 0x46, 0x46], 'webp', 'image/webp'],
]

export const fileTypeFromBuffer = async (buffer: Uint8Array) => {
    for (const [magic, ext, mime] of SIGNATURES) if (magic.every((b, i) => buffer[i] === b)) return { ext, mime }
    return undefined
}
