/** 替代 systeminformation：socketIoAdapter 用它检测 SteamVR 是否在运行，浏览器中无从得知 */
export default {
    processes: async () => ({ list: [] as { name: string }[] }),
}
