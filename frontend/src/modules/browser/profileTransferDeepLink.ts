export const PROFILE_TRANSFER_DEEP_LINK_EVENT = 'app:profile-transfer:open'
export const PROFILE_TRANSFER_DEEP_LINK_STORAGE_KEY = 'trace.profileTransfer.deepLink'

export type ProfileTransferDeepLinkPayload = {
  action?: string
  url?: string
  serverUrl?: string
  code?: string
  source?: string
}

export function profileTransferShareText(payload?: ProfileTransferDeepLinkPayload | null): string {
  if (!payload) return ''
  return String(payload.url || '').trim()
}

export function isProfileTransferDeepLinkPayload(payload?: ProfileTransferDeepLinkPayload | null): payload is ProfileTransferDeepLinkPayload {
  return String(payload?.action || '').trim() === 'profile-transfer' && profileTransferShareText(payload).length > 0
}

export function storeProfileTransferDeepLink(payload: ProfileTransferDeepLinkPayload) {
  if (!isProfileTransferDeepLinkPayload(payload)) return
  sessionStorage.setItem(PROFILE_TRANSFER_DEEP_LINK_STORAGE_KEY, JSON.stringify(payload))
  window.dispatchEvent(new CustomEvent(PROFILE_TRANSFER_DEEP_LINK_EVENT, { detail: payload }))
}

export function takeStoredProfileTransferDeepLink(): ProfileTransferDeepLinkPayload | null {
  const raw = sessionStorage.getItem(PROFILE_TRANSFER_DEEP_LINK_STORAGE_KEY)
  if (!raw) return null
  sessionStorage.removeItem(PROFILE_TRANSFER_DEEP_LINK_STORAGE_KEY)
  try {
    const payload = JSON.parse(raw) as ProfileTransferDeepLinkPayload
    return isProfileTransferDeepLinkPayload(payload) ? payload : null
  } catch {
    return null
  }
}
