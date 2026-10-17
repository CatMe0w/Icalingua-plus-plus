/** 替代 main/utils/version.ts */
import { version } from '../../../package.json'

export default { version, isProduction: process.env.NODE_ENV === 'production' }
