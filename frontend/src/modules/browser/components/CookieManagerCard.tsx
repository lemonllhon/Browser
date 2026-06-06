import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, Eye, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Card, Input, Modal, Table, Textarea, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { CookieInfo } from '../types'
import { clearBrowserCookies, exportBrowserCookies, fetchBrowserCookies, importBrowserCookies } from '../api'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { onRuntimeEvent } from '../../../shared/backend/runtime'

interface Props {
  profileId: string
  profileName: string
  running: boolean
  ready: boolean
}

type ProfileRuntimeEventPayload = {
  profileId?: string
}

const formatExpires = (expires: number) => {
  if (expires <= 0) return 'Session'
  return new Date(expires * 1000).toLocaleString('zh-CN')
}

export function CookieManagerCard({ profileId, profileName, running, ready }: Props) {
  const [cookies, setCookies] = useState<CookieInfo[]>([])
  const [filterDomain, setFilterDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [selectedCookie, setSelectedCookie] = useState<CookieInfo | null>(null)

  const loadCookies = async () => {
    if (!ready) return
    setLoading(true)
    try {
      const list = await fetchBrowserCookies(profileId)
      setCookies(list)
    } catch {
      toast.error('获取 Cookie 失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ready) {
      void loadCookies()
    } else {
      setCookies([])
    }
    const offCookiesUpdated = onRuntimeEvent<ProfileRuntimeEventPayload>('browser:cookies:updated', payload => {
      if (!payload?.profileId || payload.profileId === profileId) {
        if (ready) {
          void loadCookies()
        } else {
          setCookies([])
        }
      }
    })
    return () => {
      offCookiesUpdated?.()
    }
  }, [profileId, ready])

  const filteredCookies = useMemo(() => {
    if (!filterDomain.trim()) return cookies
    const kw = filterDomain.toLowerCase()
    return cookies.filter(c => c.domain.toLowerCase().includes(kw))
  }, [cookies, filterDomain])

  const handleClear = async () => {
    setClearing(true)
    try {
      await clearBrowserCookies(profileId)
      setCookies([])
      toast.success('Cookie 已清除')
    } catch {
      toast.error('清除 Cookie 失败')
    } finally {
      setClearing(false)
      setShowConfirm(false)
    }
  }

  const handleExport = async () => {
    try {
      const content = await exportBrowserCookies(profileId)
      const date = new Date().toISOString().slice(0, 10)
      const filename = `cookies_${profileName}_${date}.txt`
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Cookie 已导出')
    } catch {
      toast.error('导出 Cookie 失败')
    }
  }

  const handleImport = async () => {
    const content = importText.trim()
    if (!content) {
      toast.error('请粘贴 Netscape Cookie 内容')
      return
    }
    setImporting(true)
    try {
      const result = await importBrowserCookies(profileId, content)
      toast.success(`Cookie 已导入：成功 ${result.imported}${result.skipped ? `，跳过 ${result.skipped}` : ''}`)
      setImportOpen(false)
      setImportText('')
      await loadCookies()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '导入 Cookie 失败'))
    } finally {
      setImporting(false)
    }
  }

  const handleCopyCookieValue = async () => {
    if (!selectedCookie) return
    try {
      await navigator.clipboard.writeText(selectedCookie.value || '')
      toast.success('Cookie 值已复制')
    } catch {
      toast.error('复制 Cookie 值失败')
    }
  }

  const columns: TableColumn<CookieInfo>[] = [
    { key: 'domain', title: '域名', render: v => <span className="font-mono text-xs">{String(v ?? '')}</span> },
    { key: 'name', title: '名称', render: v => <span className="font-mono text-xs">{String(v ?? '')}</span> },
    {
      key: 'value',
      title: '值',
      render: v => (
        <span className="font-mono text-xs max-w-[120px] truncate block" title={String(v ?? '')}>{String(v ?? '')}</span>
      ),
    },
    { key: 'expires', title: '过期时间', render: v => formatExpires(v as number) },
    {
      key: 'httpOnly',
      title: 'HttpOnly',
      render: v => <Badge variant={v ? 'success' : 'default'}>{v ? '是' : '否'}</Badge>,
    },
    {
      key: 'secure',
      title: 'Secure',
      render: v => <Badge variant={v ? 'success' : 'default'}>{v ? '是' : '否'}</Badge>,
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (_v, record) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation()
            setSelectedCookie(record)
          }}
        >
          <Eye className="w-4 h-4" />
          查看
        </Button>
      ),
    },
  ]

  const subtitle = !running
    ? '实例未运行，无法管理 Cookie'
    : !ready
      ? '实例运行中，等待调试接口就绪后可管理 Cookie'
      : `共 ${cookies.length} 条${filterDomain ? `，已过滤 ${filteredCookies.length} 条` : ''}`

  return (
    <Card title="Cookie 管理" subtitle={subtitle}>
      {!running ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
          请先启动实例以查看 Cookie
        </p>
      ) : !ready ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
          浏览器已启动，正在等待调试接口就绪
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <Input
              placeholder="按域名过滤..."
              value={filterDomain}
              onChange={e => setFilterDomain(e.target.value)}
              className="w-full sm:w-64"
            />
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="ghost" onClick={loadCookies} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              <Button size="sm" variant="ghost" onClick={handleExport}>
                <Download className="w-4 h-4" />
                导出 Netscape
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
                <Upload className="w-4 h-4" />
                导入
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowConfirm(true)} disabled={clearing}>
                <Trash2 className="w-4 h-4" />
                清除全部
              </Button>
            </div>
          </div>

          {showConfirm && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 flex items-center justify-between gap-4">
              <span className="text-sm text-[var(--color-text-secondary)]">
                确认清除该实例的所有 Cookie？此操作不可撤销。
              </span>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setShowConfirm(false)}>取消</Button>
                <Button size="sm" onClick={handleClear} disabled={clearing}>确认清除</Button>
              </div>
            </div>
          )}

          <Table
            columns={columns}
            data={filteredCookies}
            rowKey={record => `${record.domain}|${record.path}|${record.name}`}
            onRowClick={record => setSelectedCookie(record)}
          />

          <Modal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            title="导入 Cookie"
            width="640px"
            footer={
              <>
                <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={importing}>取消</Button>
                <Button onClick={handleImport} loading={importing}>导入</Button>
              </>
            }
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">粘贴 Netscape 格式 Cookie 文本，每行包含 domain、flag、path、secure、expires、name、value。</p>
              <Textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                rows={12}
                placeholder={'# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tsession\tabc123'}
              />
            </div>
          </Modal>

          <Modal
            open={!!selectedCookie}
            onClose={() => setSelectedCookie(null)}
            title="Cookie 详情"
            width="640px"
            footer={
              <>
                <Button variant="secondary" onClick={() => setSelectedCookie(null)}>关闭</Button>
                <Button onClick={handleCopyCookieValue} disabled={!selectedCookie}>
                  <Copy className="w-4 h-4" />
                  复制值
                </Button>
              </>
            }
          >
            {selectedCookie && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <CookieDetailItem label="域名" value={selectedCookie.domain} />
                  <CookieDetailItem label="名称" value={selectedCookie.name} />
                  <CookieDetailItem label="路径" value={selectedCookie.path} />
                  <CookieDetailItem label="过期时间" value={formatExpires(selectedCookie.expires)} />
                  <CookieDetailItem label="HttpOnly" value={selectedCookie.httpOnly ? '是' : '否'} />
                  <CookieDetailItem label="Secure" value={selectedCookie.secure ? '是' : '否'} />
                  <CookieDetailItem label="SameSite" value={selectedCookie.sameSite || '-'} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-sm font-medium text-[var(--color-text-secondary)]">完整值</div>
                  <Textarea
                    value={selectedCookie.value || ''}
                    onChange={() => undefined}
                    rows={6}
                    readOnly
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </Modal>
        </div>
      )}
    </Card>
  )
}

function CookieDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-2 min-w-0">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 font-mono text-xs text-[var(--color-text-primary)] break-all">{value || '-'}</div>
    </div>
  )
}
