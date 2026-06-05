import type { BrowserProfile, BrowserProxy } from '../types'

export const getBrowserProfileProxyDisplayName = (
  profile: BrowserProfile,
  proxies: BrowserProxy[],
) => {
  if (profile.autoProxySwitchEnabled) {
    const proxy = proxies.find(item => item.proxyId === profile.autoProxySwitchLastProxyId)
    const mode = profile.autoProxySwitchMode === 'manual' ? '手动' : '定时'
    const group = profile.autoProxySwitchGroupName || '全部'
    return `切换(${mode}/${group})：${proxy?.proxyName || profile.autoProxySwitchLastProxyId || '待启动随机'}`
  }

  const proxy = proxies.find(item => item.proxyId === profile.proxyId)
  return proxy ? proxy.proxyName : profile.proxyId || profile.proxyConfig || '-'
}
