import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, RotateCcw, GripVertical } from 'lucide-react'
import { Button, Card, ConfirmModal, Input, toast } from '../../../shared/components'
import type { BrowserBookmark, BrowserStartURL } from '../types'
import {
  fetchBookmarks,
  fetchDefaultStartURLs,
  resetBookmarks,
  resetDefaultStartURLs,
  saveBookmarks,
  saveDefaultStartURLs,
} from '../api'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'

type ManagedItem = {
  name: string
  url: string
}

type ResetTarget = 'startUrls' | 'bookmarks' | null

function EditableURLList<T extends ManagedItem>({
  items,
  onChange,
  addLabel,
  emptyText,
  namePlaceholder,
  dragIndex,
  setDragIndex,
}: {
  items: T[]
  onChange: (items: T[]) => void
  addLabel: string
  emptyText: string
  namePlaceholder: string
  dragIndex: number | null
  setDragIndex: (index: number | null) => void
}) {
  const handleChange = (index: number, field: keyof ManagedItem, value: string) => {
    onChange(items.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const next = [...items]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    onChange(next)
    setDragIndex(index)
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={e => handleDragOver(e, index)}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
              dragIndex === index
                ? 'border-[var(--color-primary)] bg-[var(--color-bg-hover)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
            }`}
          >
            <GripVertical className="w-4 h-4 text-[var(--color-text-muted)] cursor-grab shrink-0" />
            <Input
              value={item.name}
              onChange={e => handleChange(index, 'name', e.target.value)}
              placeholder={namePlaceholder}
              className="w-36 shrink-0"
            />
            <Input
              value={item.url}
              onChange={e => handleChange(index, 'url', e.target.value)}
              placeholder="https://..."
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
            {emptyText}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onChange([...items, { name: '', url: '' } as T])}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
      >
        <Plus className="w-4 h-4" />
        {addLabel}
      </button>
    </>
  )
}

export function BookmarkSettingsPage({ embedded = false }: { embedded?: boolean }) {
  const [bookmarkItems, setBookmarkItems] = useState<BrowserBookmark[]>([])
  const [startURLItems, setStartURLItems] = useState<BrowserStartURL[]>([])
  const [savingBookmarks, setSavingBookmarks] = useState(false)
  const [savingStartURLs, setSavingStartURLs] = useState(false)
  const [resetTarget, setResetTarget] = useState<ResetTarget>(null)
  const [bookmarkDragIndex, setBookmarkDragIndex] = useState<number | null>(null)
  const [startURLDragIndex, setStartURLDragIndex] = useState<number | null>(null)
  const dirtyRef = useRef({ startUrls: false, bookmarks: false })

  const load = useCallback(async (options: { preserveDirty?: boolean } = {}) => {
    const [startURLs, bookmarks] = await Promise.all([
      fetchDefaultStartURLs(),
      fetchBookmarks(),
    ])
    if (!options.preserveDirty || !dirtyRef.current.startUrls) {
      setStartURLItems(startURLs)
    }
    if (!options.preserveDirty || !dirtyRef.current.bookmarks) {
      setBookmarkItems(bookmarks)
    }
  }, [])

  useEffect(() => {
    void load()
    const offDefaultsUpdated = onRuntimeEvent('browser:defaults:updated', () => {
      void load({ preserveDirty: true })
    })
    return () => {
      offDefaultsUpdated?.()
    }
  }, [load])

  useVisibleRefresh(() => load({ preserveDirty: true }), 2000, !savingBookmarks && !savingStartURLs)

  const updateStartURLItems = (items: BrowserStartURL[]) => {
    dirtyRef.current.startUrls = true
    setStartURLItems(items)
  }

  const updateBookmarkItems = (items: BrowserBookmark[]) => {
    dirtyRef.current.bookmarks = true
    setBookmarkItems(items)
  }

  const validateItems = (items: ManagedItem[]) => {
    const valid = items.filter(i => i.name.trim() && i.url.trim())
    if (valid.length !== items.length) {
      toast.error('存在空的名称或 URL，请填写完整后保存')
      return false
    }
    return true
  }

  const handleSaveStartURLs = async () => {
    if (!validateItems(startURLItems)) return
    setSavingStartURLs(true)
    try {
      await saveDefaultStartURLs(startURLItems)
      dirtyRef.current.startUrls = false
      setStartURLItems(await fetchDefaultStartURLs())
      toast.success('默认打开页已保存，下次启动实例时生效')
    } finally {
      setSavingStartURLs(false)
    }
  }

  const handleSaveBookmarks = async () => {
    if (!validateItems(bookmarkItems)) return
    setSavingBookmarks(true)
    try {
      await saveBookmarks(bookmarkItems)
      dirtyRef.current.bookmarks = false
      setBookmarkItems(await fetchBookmarks())
      toast.success('书签已保存，下次新建实例时生效')
    } finally {
      setSavingBookmarks(false)
    }
  }

  const handleReset = async () => {
    if (resetTarget === 'startUrls') {
      await resetDefaultStartURLs()
      dirtyRef.current.startUrls = false
      setStartURLItems(await fetchDefaultStartURLs())
      toast.success('已恢复默认打开页')
    }
    if (resetTarget === 'bookmarks') {
      await resetBookmarks()
      dirtyRef.current.bookmarks = false
      setBookmarkItems(await fetchBookmarks())
      toast.success('已恢复默认书签')
    }
    setResetTarget(null)
  }

  const resetTitle = resetTarget === 'startUrls' ? '恢复默认打开页' : '恢复默认书签'
  const resetContent = resetTarget === 'startUrls'
    ? '将清除当前自定义打开页，恢复为 IPPure、IPLark、Ping0。确定继续？'
    : '将清除当前所有自定义书签，恢复为内置默认列表。确定继续？'

  return (
    <div className="space-y-5 animate-fade-in">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">默认内容管理</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">统一管理实例启动打开页与新建实例默认书签</p>
          </div>
        </div>
      )}

      <Card title={`默认打开页（${startURLItems.length} 项）`} subtitle="实例启动时自动打开，拖拽左侧图标可调整打开顺序">
        <div className="flex items-center justify-end gap-2 mb-3">
          <Button variant="secondary" size="sm" onClick={() => setResetTarget('startUrls')}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            恢复默认
          </Button>
          <Button size="sm" onClick={handleSaveStartURLs} loading={savingStartURLs}>保存打开页</Button>
        </div>
        <EditableURLList
          items={startURLItems}
          onChange={updateStartURLItems}
          addLabel="添加打开页"
          emptyText="暂无默认打开页，点击下方按钮添加"
          namePlaceholder="名称，如 IPPure"
          dragIndex={startURLDragIndex}
          setDragIndex={setStartURLDragIndex}
        />
      </Card>

      <Card title={`默认书签（${bookmarkItems.length} 项）`} subtitle="新建实例首次启动时自动写入书签栏，已有书签不受影响">
        <div className="flex items-center justify-end gap-2 mb-3">
          <Button variant="secondary" size="sm" onClick={() => setResetTarget('bookmarks')}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            恢复默认
          </Button>
          <Button size="sm" onClick={handleSaveBookmarks} loading={savingBookmarks}>保存书签</Button>
        </div>
        <EditableURLList
          items={bookmarkItems}
          onChange={updateBookmarkItems}
          addLabel="添加书签"
          emptyText="暂无书签，点击下方按钮添加"
          namePlaceholder="名称，如 Google"
          dragIndex={bookmarkDragIndex}
          setDragIndex={setBookmarkDragIndex}
        />
      </Card>

      <ConfirmModal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={handleReset}
        title={resetTitle}
        content={resetContent}
        confirmText="确定恢复"
        danger
      />
    </div>
  )
}
