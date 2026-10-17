/**
 * 替代 main/utils/writeCsvData.ts：生成与 csv-writer 相同格式的 CSV，交给浏览器下载。
 * savePath 只用来取文件名（网页版的 "另存为" 对话框直接返回默认文件名，见 web/shims/electron.ts）。
 */
const escapeField = (value: unknown) => {
    const text = value === undefined || value === null ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default async function (
    header: Array<{ id: string; title: string }>,
    data: Record<string, any>[],
    savePath: string,
): Promise<boolean> {
    if (!savePath) return false
    const lines = [header.map((h) => escapeField(h.title)).join(',')]
    for (const record of data) lines.push(header.map((h) => escapeField(record[h.id])).join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }))
    a.download = savePath.split(/[\\/]/).pop()
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    return true
}
