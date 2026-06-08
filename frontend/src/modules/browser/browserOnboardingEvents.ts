export type BackupRestoreDemoTab = 'export' | 'restore' | 'restore-cloud'

export type BrowserListBackupDemoDetail = {
  open: boolean
  tab?: BackupRestoreDemoTab
}

export const BROWSER_LIST_BACKUP_DEMO_EVENT = 'trace:onboarding:browser-list-backup'

export function requestBrowserListBackupDemo(detail: BrowserListBackupDemoDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BROWSER_LIST_BACKUP_DEMO_EVENT, { detail }))
}
