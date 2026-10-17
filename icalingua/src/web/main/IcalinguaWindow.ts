/** 替代 utils/IcalinguaWindow.ts：创建网页版子窗口 */
import { createWindow } from '../webWindow'

export const newIcalinguaWindow = (options?: Record<string, any>, extra?: { stableTitle?: string }) =>
    createWindow({ title: extra?.stableTitle, ...options })
export const openMannounceWindow = newIcalinguaWindow
