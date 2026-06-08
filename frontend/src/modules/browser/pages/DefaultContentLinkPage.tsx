import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, FolderTree, Link2, Plus, Save, Tag, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Input, Select, Switch, toast } from '../../../shared/components'
import type { BrowserBookmark, BrowserGroupWithCount, BrowserStartURL, DefaultContentRule } from '../types'
import { saveDefaultContentRules } from '../api'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { BookmarkSettingsPage } from './BookmarkSettingsPage'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'
import { getBrowserSharedDataSnapshot, refreshBrowserSharedData, useBrowserSharedData } from '../stores/browserSharedDataStore'

type ManagedItem = BrowserStartURL | BrowserBookmark

function makeRuleId(scope: string, targetId: string, targetName: string) {
  const target = targetId || targetName
  return `${scope}:${target}:${Date.now()}`
}

function normalizeURLItems<T extends ManagedItem>(items: T[]) {
  const seen = new Set<string>()
  return items
    .map(item => ({ name: item.name.trim(), url: item.url.trim() }) as T)
    .filter(item => {
      if (!item.name || !item.url) return false
      const key = item.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function RuleURLList<T extends ManagedItem>({
  title,
  items,
  onChange,
}: {
  title: string
  items: T[]
  onChange: (items: T[]) => void
}) {
  const update = (index: number, field: keyof ManagedItem, value: string) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">{title}</span>
        <button
          type="button"
          onClick={() => onChange([...items, { name: '', url: '' } as T])}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:opacity-80"
        >
          <Plus className="w-3.5 h-3.5" />添加
        </button>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 rounded-lg border border-dashed border-[var(--color-border-default)] text-xs text-[var(--color-text-muted)]">未配置</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[140px_minmax(0,1fr)_32px] gap-2">
              <Input value={item.name} onChange={event => update(index, 'name', event.target.value)} placeholder="名称" />
              <Input value={item.url} onChange={event => update(index, 'url', event.target.value)} placeholder="https://..." />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                className="h-9 inline-flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function groupOptions(groups: BrowserGroupWithCount[]) {
  const byParent = new Map<string, BrowserGroupWithCount[]>()
  groups.forEach(group => {
    const list = byParent.get(group.parentId || '') || []
    list.push(group)
    byParent.set(group.parentId || '', list)
  })
  const result: { value: string; label: string }[] = []
  const visit = (parentId: string, level: number) => {
    ;(byParent.get(parentId) || [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.groupName.localeCompare(b.groupName))
      .forEach(group => {
        result.push({ value: group.groupId, label: `${'　'.repeat(level)}${group.groupName}` })
        visit(group.groupId, level + 1)
      })
  }
  visit('', 0)
  return result
}

export function DefaultContentLinkPage() {
  const [mode, setMode] = useState<'global' | 'rules'>('global')
  const [rules, setRules] = useState<DefaultContentRule[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [groups, setGroups] = useState<BrowserGroupWithCount[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)
  const sharedData = useBrowserSharedData(['defaults', 'tags', 'groups'])

  const groupsById = useMemo(() => new Map(groups.map(group => [group.groupId, group])), [groups])
  const tagOptions = useMemo(() => tags.map(tag => ({ value: tag, label: tag })), [tags])
  const resolvedGroupOptions = useMemo(() => groupOptions(groups), [groups])
  const selectedRule = rules.find(rule => rule.ruleId === selectedRuleId) || rules[0] || null

  const markDirty = () => {
    dirtyRef.current = true
    setDirty(true)
  }

  const markClean = () => {
    dirtyRef.current = false
    setDirty(false)
  }

  const setSavingState = (value: boolean) => {
    savingRef.current = value
    setSaving(value)
  }

  const applyData = useCallback((ruleList: DefaultContentRule[], tagList: string[], groupList: BrowserGroupWithCount[], options?: { force?: boolean }) => {
    if (!options?.force && (dirtyRef.current || savingRef.current)) {
      return
    }
    setRules(ruleList)
    setTags(tagList)
    setGroups(groupList)
    setSelectedRuleId(current => {
      if (current && ruleList.some(rule => rule.ruleId === current)) {
        return current
      }
      return ruleList[0]?.ruleId || ''
    })
    markClean()
  }, [])

  const load = useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && (dirtyRef.current || savingRef.current)) {
      return
    }
    await refreshBrowserSharedData(['defaults', 'tags', 'groups'], { silent: !options?.force })
    const snapshot = getBrowserSharedDataSnapshot()
    applyData(snapshot.defaultContentRules, snapshot.tags, snapshot.groups, options)
  }, [applyData])

  useEffect(() => {
    void load({ force: true })
  }, [load])

  useEffect(() => {
    if (dirtyRef.current || savingRef.current) {
      return
    }
    if (sharedData.loaded.defaults || sharedData.loaded.tags || sharedData.loaded.groups) {
      applyData(sharedData.defaultContentRules, sharedData.tags, sharedData.groups)
    }
  }, [applyData, sharedData.defaultContentRules, sharedData.groups, sharedData.loaded.defaults, sharedData.loaded.groups, sharedData.loaded.tags, sharedData.tags])

  useVisibleRefresh(() => load(), 2000, !dirty && !saving)

  const upsertRule = (rule: DefaultContentRule) => {
    markDirty()
    setRules(prev => prev.map(item => item.ruleId === rule.ruleId ? rule : item))
  }

  const addRule = (scope: 'tag' | 'group') => {
    const firstTarget = scope === 'tag' ? tags[0] : groups[0]?.groupId || ''
    const targetName = scope === 'tag'
      ? firstTarget || '新标签'
      : groupsById.get(firstTarget)?.groupName || '新分组'
    const rule: DefaultContentRule = {
      ruleId: makeRuleId(scope, firstTarget, targetName),
      scope,
      targetId: scope === 'group' ? firstTarget : '',
      targetName,
      startUrls: [],
      bookmarks: [],
      enabled: true,
      applyToChilds: true,
      includeGlobalDefaults: true,
    }
    markDirty()
    setRules(prev => [...prev, rule])
    setSelectedRuleId(rule.ruleId)
  }

  const removeRule = (ruleId: string) => {
    markDirty()
    setRules(prev => prev.filter(rule => rule.ruleId !== ruleId))
    if (selectedRuleId === ruleId) {
      const next = rules.find(rule => rule.ruleId !== ruleId)
      setSelectedRuleId(next?.ruleId || '')
    }
  }

  const saveRules = async () => {
    const normalized = rules
      .map(rule => ({
        ...rule,
        targetName: rule.targetName.trim(),
        startUrls: normalizeURLItems(rule.startUrls),
        bookmarks: normalizeURLItems(rule.bookmarks),
        includeGlobalDefaults: rule.includeGlobalDefaults !== false,
      }))
      .filter(rule => rule.targetName || rule.targetId)
    setSavingState(true)
    try {
      await saveDefaultContentRules(normalized)
      setRules(normalized)
      markClean()
      toast.success('默认内容联动已保存')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSavingState(false)
    }
  }

  const updateTarget = (value: string) => {
    if (!selectedRule) return
    if (selectedRule.scope === 'group') {
      const group = groupsById.get(value)
      upsertRule({ ...selectedRule, targetId: value, targetName: group?.groupName || selectedRule.targetName })
      return
    }
    upsertRule({ ...selectedRule, targetId: '', targetName: value })
  }

  const duplicateCount = useMemo(() => {
    const urls = new Set<string>()
    let duplicate = 0
    rules.forEach(rule => {
      ;[...rule.startUrls, ...rule.bookmarks].forEach(item => {
        const url = item.url.trim().toLowerCase()
        if (!url) return
        if (urls.has(url)) duplicate += 1
        urls.add(url)
      })
    })
    return duplicate
  }, [rules])

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="px-5 py-3 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-base)] flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">默认内容</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">统一管理全局默认内容，以及标签和分组触发的扩展内容</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-1">
          <Button size="sm" variant={mode === 'global' ? undefined : 'ghost'} onClick={() => setMode('global')}>全局默认</Button>
          <Button size="sm" variant={mode === 'rules' ? undefined : 'ghost'} onClick={() => setMode('rules')}>联动规则</Button>
        </div>
      </div>

      {mode === 'global' ? (
        <div className="flex-1 min-h-0 overflow-auto p-5">
          <BookmarkSettingsPage embedded />
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex">
      <div className="w-72 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-surface)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">默认内容联动</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{rules.length} 条规则，{duplicateCount} 个重复 URL 会去重</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => addRule('tag')} className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]" title="按标签新增">
              <Tag className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => addRule('group')} className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]" title="按分组新增">
              <FolderTree className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {rules.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[var(--color-text-muted)]">暂无联动规则</div>
          ) : rules.map(rule => (
            <button
              key={rule.ruleId}
              type="button"
              onClick={() => setSelectedRuleId(rule.ruleId)}
              className={`w-full px-4 py-3 text-left flex items-start gap-3 transition-colors ${selectedRule?.ruleId === rule.ruleId ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
            >
              {rule.scope === 'tag' ? <Tag className="w-4 h-4 mt-0.5 shrink-0" /> : <FolderTree className="w-4 h-4 mt-0.5 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{rule.targetName || '未命名'}</span>
                <span className="block text-xs opacity-70 mt-0.5">{rule.startUrls.length} 打开页 / {rule.bookmarks.length} 书签</span>
              </span>
              {!rule.enabled && <span className="text-xs opacity-60">停用</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">标签与分组默认内容</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">每条规则可选择是否叠加全局默认内容，最终按 URL 保持同一实例</p>
          </div>
          <Button onClick={saveRules} loading={saving}>
            <Save className="w-4 h-4" />保存联动
          </Button>
        </div>

        {!selectedRule ? (
          <Card>
            <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">从左侧新增一个标签或分组规则</div>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card
              title="规则目标"
              actions={(
                <>
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <span>启用</span>
                    <Switch checked={selectedRule.enabled} onChange={checked => upsertRule({ ...selectedRule, enabled: checked })} />
                  </div>
                  <Button size="sm" variant="danger" onClick={() => removeRule(selectedRule.ruleId)}>
                    <Trash2 className="w-4 h-4" />删除
                  </Button>
                </>
              )}
            >
              <div className="grid grid-cols-[160px_minmax(220px,360px)_1fr] gap-3 items-end">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">类型</p>
                  <Select
                    value={selectedRule.scope}
                    onChange={event => upsertRule({ ...selectedRule, scope: event.target.value as 'tag' | 'group', targetId: '', targetName: '' })}
                    options={[{ value: 'tag', label: '标签' }, { value: 'group', label: '分组' }]}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">目标</p>
                  {selectedRule.scope === 'tag' ? (
                    tagOptions.length > 0 ? (
                      <Select value={selectedRule.targetName} onChange={event => updateTarget(event.target.value)} options={tagOptions} />
                    ) : (
                      <Input value={selectedRule.targetName} onChange={event => updateTarget(event.target.value)} placeholder="输入标签名称" />
                    )
                  ) : (
                    <Select value={selectedRule.targetId || ''} onChange={event => updateTarget(event.target.value)} options={resolvedGroupOptions.length ? resolvedGroupOptions : [{ value: '', label: '暂无分组' }]} />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={selectedRule.scope === 'tag' ? 'info' : 'default'}>
                    {selectedRule.scope === 'tag' ? '标签规则' : '分组规则'}
                  </Badge>
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
                      checked={selectedRule.includeGlobalDefaults !== false}
                      onChange={event => upsertRule({ ...selectedRule, includeGlobalDefaults: event.target.checked })}
                    />
                    包含全局默认
                  </label>
                  {selectedRule.scope === 'group' && (
                    <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
                        checked={!!selectedRule.applyToChilds}
                        onChange={event => upsertRule({ ...selectedRule, applyToChilds: event.target.checked })}
                      />
                      包含子分组
                    </label>
                  )}
                </div>
              </div>
            </Card>

            <Card title="联动内容" subtitle="关闭“包含全局默认”后，命中该规则的实例只使用标签或分组规则内容；同一 URL 会自动去重">
              <div className="space-y-6">
                <div className="space-y-3 pb-5 border-b border-[var(--color-border-muted)]">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
                      <Link2 className="w-4 h-4" />默认打开页
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">实例启动时按顺序打开</p>
                  </div>
                  <RuleURLList
                    title="启动时打开"
                    items={selectedRule.startUrls}
                    onChange={items => upsertRule({ ...selectedRule, startUrls: items })}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
                      <Bookmark className="w-4 h-4" />默认书签
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">实例启动时写入书签栏</p>
                  </div>
                  <RuleURLList
                    title="写入书签"
                    items={selectedRule.bookmarks}
                    onChange={items => upsertRule({ ...selectedRule, bookmarks: items })}
                  />
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  )
}
