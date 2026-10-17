/** 替代 main/utils/themes.ts */
import { emitToRenderer } from '../ipcBus'

export const getThemeData = () => undefined
export const getThemeBackgroundColor = () =>
    matchMedia('(prefers-color-scheme: dark)').matches ? '#131d28' : '#ffffff'
export const useTheme = (theme: string) => emitToRenderer('theme:use', theme)
export const refreshTheme = () => emitToRenderer('theme:refresh')
export const getThemeList = () => ['light', 'dark']
export const autoSetTheme = () => {}
