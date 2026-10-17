/** 替代 utils/IcalinguaWindow.ts：独立窗口暂不支持，返回一个吸收所有调用的假窗口 */
import { createFakeWindow } from './unsupported'

export const newIcalinguaWindow = () => createFakeWindow()
export const openMannounceWindow = () => createFakeWindow()
