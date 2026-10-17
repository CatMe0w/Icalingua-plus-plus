/** 替代 main/utils/updateChecker.ts：网页版随部署更新，不检查新版本 */
const noUpdate = { hasUpdate: false }

export const checkUpdate = async () => noUpdate
export const getCachedUpdate = () => noUpdate
