/** 替代 main/utils/configManager.ts：配置存在 localStorage */
import { getConfig, saveConfig } from '../config'

export { getConfig }
export const saveConfigFile = saveConfig
