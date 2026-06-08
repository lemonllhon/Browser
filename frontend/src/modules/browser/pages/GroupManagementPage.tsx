import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Folder, FolderInput, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, FormItem, Input, Select, toast } from '../../../shared/components'
import type { BrowserGroupInput, BrowserGroupWithCount, BrowserProfile } from '../types'
import { createGroup, deleteGroup, moveInstancesToGroup, updateGroup } from '../api'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'
import { getBrowserSharedDataSnapshot, refreshBrowserSharedData, useBrowserSharedData } from '../stores/browserSharedDataStore'

interface TreeGroup extends BrowserGroupWithCount {
  level: number
}

function flattenGroups(groups: BrowserGroupWithCount[]): TreeGroup[] {
  const result: TreeGroup[] = []
  const visited = new Set<string>()

  const addChildren = (parentId: string, level: number) => {
    groups
      .filter(group => (group.parentId || '') === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.groupName.localeCompare(b.groupName, 'zh-CN'))
      .forEach(group => {
        if (visited.has(group.groupId)) return
        visited.add(group.groupId)
        result.push({ ...group, level })
        addChildren(group.groupId, level + 1)
      })
  }

  addChildren('', 0)

  groups.forEach(group => {
    if (!visited.has(group.groupId)) {
      result.push({ ...group, level: 0 })
    }
  })

  return result
}

function resolveGroupName(groups: BrowserGroupWithCount[], groupId?: string) {
  if (!groupId) return '未分组'
  return groups.find(group => group.groupId === groupId)?.groupName || '未知分组'
}

function buildGroupOptions(groups: BrowserGroupWithCount[], excludeGroupId?: string) {
  const excludedIds = new Set<string>()
  if (excludeGroupId) {
    excludedIds.add(excludeGroupId)
    const collectChildren = (parentId: string) => {
      groups
        .filter(group => group.parentId === parentId)
        .forEach(group => {
          excludedIds.add(group.groupId)
          collectChildren(group.groupId)
        })
    }
    collectChildren(excludeGroupId)
  }

  const flat = flattenGroups(groups).filter(group => !excludedIds.has(group.groupId))
  return [
    { value: '', label: '根级分组' },
    ...flat.map(group => ({
      value: group.groupId,
      label: `${'　'.repeat(group.level)}${group.groupName}`,
    })),
  ]
}

interface GroupPanelProps {
  groups: BrowserGroupWithCount[]
  selectedGroupId: string
  totalCount: number
  ungroupedCount: number
  onSelect: (groupId: string) => void
  onCreateRoot: () => void
  onEdit: (group: BrowserGroupWithCount) => void
  onCreateChild: (group: BrowserGroupWithCount) => void
  onDelete: (group: BrowserGroupWithCount) => void
}

function GroupPanel({
  groups,
  selectedGroupId,
  totalCount,
  ungroupedCount,
  onSelect,
  onCreateRoot,
  onEdit,
  onCreateChild,
  onDelete,
}: GroupPanelProps) {
  const flatGroups = useMemo(() => flattenGroups(groups), [groups])

  return (
    <div className="w-64 shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[var(--color-bg-surface)]">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">分组列表</span>
        <button
          onClick={onCreateRoot}
          title="新建根分组"
          className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <button
          onClick={() => onSelect('')}
          className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors ${
            selectedGroupId === ''
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 opacity-60" />
            全部实例
          </span>
          <span className="text-xs opacity-60">{totalCount}</span>
        </button>

        <button
          onClick={() => onSelect('__ungrouped__')}
          className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors ${
            selectedGroupId === '__ungrouped__'
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <FolderInput className="w-3.5 h-3.5 opacity-60" />
            未分组
          </span>
          <span className="text-xs opacity-60">{ungroupedCount}</span>
        </button>

        {flatGroups.length > 0 && (
          <div className="mt-2">
            <div className="px-4 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">我的分组</div>
            {flatGroups.map(group => (
              <div
                key={group.groupId}
                className={`group flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${
                  selectedGroupId === group.groupId
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
                style={{ paddingLeft: `${group.level * 16 + 16}px` }}
                onClick={() => onSelect(group.groupId)}
              >
                <Folder className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{group.groupName}</span>
                <span className="text-xs opacity-60 shrink-0">{group.instanceCount}</span>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={event => event.stopPropagation()}>
                  <button
                    className="p-0.5 rounded hover:bg-[var(--color-primary)]/10"
                    title="新建子分组"
                    onClick={() => onCreateChild(group)}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-[var(--color-primary)]/10"
                    title="编辑分组"
                    onClick={() => onEdit(group)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                    title="删除分组"
                    onClick={() => onDelete(group)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {flatGroups.length === 0 && (
          <p className="px-4 py-3 text-xs text-[var(--color-text-muted)]">暂无分组，点击 + 创建</p>
        )}
      </div>
    </div>
  )
}

interface GroupEditorProps {
  groups: BrowserGroupWithCount[]
  editingGroup: BrowserGroupWithCount | null
  defaultParentId: string
  onCancel: () => void
  onSaved: () => void
}

function GroupEditor({ groups, editingGroup, defaultParentId, onCancel, onSaved }: GroupEditorProps) {
  const [groupName, setGroupName] = useState(editingGroup?.groupName || '')
  const [parentId, setParentId] = useState(editingGroup?.parentId || defaultParentId)
  const [sortOrder, setSortOrder] = useState(editingGroup?.sortOrder || 0)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setGroupName(editingGroup?.groupName || '')
    setParentId(editingGroup?.parentId || defaultParentId)
    setSortOrder(editingGroup?.sortOrder || 0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [defaultParentId, editingGroup])

  const handleSave = async () => {
    const name = groupName.trim()
    if (!name) {
      toast.error('分组名称不能为空')
      return
    }

    const input: BrowserGroupInput = { groupName: name, parentId, sortOrder }
    setSaving(true)
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.groupId, input)
        toast.success('分组已更新')
      } else {
        await createGroup(input)
        toast.success('分组已创建')
      }
      onSaved()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存分组失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title={editingGroup ? '编辑分组' : '新建分组'} subtitle="分组会同步出现在实例列表筛选、新建配置和编辑配置中">
      <div className="space-y-4">
        <FormItem label="分组名称" required>
          <input
            ref={inputRef}
            value={groupName}
            onChange={event => setGroupName(event.target.value)}
            placeholder="例如：账号矩阵 A / 客户项目 / 测试环境"
            className="block h-9 w-full px-3 text-sm bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-lg placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-strong)] focus:ring-1 focus:ring-[var(--color-border-strong)] transition-colors duration-150"
          />
        </FormItem>

        <FormItem label="上级分组">
          <Select
            value={parentId}
            onChange={event => setParentId(event.target.value)}
            options={buildGroupOptions(groups, editingGroup?.groupId)}
          />
        </FormItem>

        <FormItem label="排序值">
          <Input
            type="number"
            value={String(sortOrder)}
            onChange={event => setSortOrder(Number(event.target.value) || 0)}
            placeholder="数字越小越靠前"
          />
        </FormItem>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={handleSave} loading={saving}>{editingGroup ? '保存分组' : '创建分组'}</Button>
        </div>
      </div>
    </Card>
  )
}

export function GroupManagementPage({ embedded = false }: { embedded?: boolean }) {
  const [groups, setGroups] = useState<BrowserGroupWithCount[]>([])
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [targetGroupId, setTargetGroupId] = useState('')
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<BrowserGroupWithCount | null>(null)
  const [defaultParentId, setDefaultParentId] = useState('')
  const sharedData = useBrowserSharedData(['groups', 'profiles'])

  const applyData = useCallback((groupList: BrowserGroupWithCount[], profileList: BrowserProfile[]) => {
    setGroups(groupList)
    setProfiles(profileList)
    setSelectedGroupId(current => current && current !== '__ungrouped__' && !groupList.some(group => group.groupId === current) ? '' : current)
    setTargetGroupId(current => current && !groupList.some(group => group.groupId === current) ? '' : current)
    setSelectedIds(current => {
      if (!current.size) return current
      const existingIds = new Set(profileList.map(profile => profile.profileId))
      const next = new Set(Array.from(current).filter(profileId => existingIds.has(profileId)))
      return next.size === current.size ? current : next
    })
  }, [])

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    try {
      await refreshBrowserSharedData(['groups', 'profiles'], { silent: options?.silent })
      const snapshot = getBrowserSharedDataSnapshot()
      applyData(snapshot.groups, snapshot.profiles)
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [applyData])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (sharedData.loaded.groups || sharedData.loaded.profiles) {
      applyData(sharedData.groups, sharedData.profiles)
      if (sharedData.loaded.groups && sharedData.loaded.profiles) {
        setLoading(false)
      }
    }
  }, [applyData, sharedData.groups, sharedData.loaded.groups, sharedData.loaded.profiles, sharedData.profiles])

  useVisibleRefresh(() => load({ silent: true }))

  useEffect(() => {
    setSelectedIds(new Set())
  }, [selectedGroupId])

  const ungroupedCount = useMemo(() => profiles.filter(profile => !profile.groupId).length, [profiles])

  const displayProfiles = useMemo(() => {
    if (selectedGroupId === '__ungrouped__') {
      return profiles.filter(profile => !profile.groupId)
    }
    if (selectedGroupId) {
      return profiles.filter(profile => profile.groupId === selectedGroupId)
    }
    return profiles
  }, [profiles, selectedGroupId])

  const selectedGroupLabel = selectedGroupId === '__ungrouped__'
    ? '未分组'
    : selectedGroupId
      ? resolveGroupName(groups, selectedGroupId)
      : '全部实例'

  const isAllSelected = displayProfiles.length > 0 && displayProfiles.every(profile => selectedIds.has(profile.profileId))
  const isIndeterminate = !isAllSelected && displayProfiles.some(profile => selectedIds.has(profile.profileId))

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(displayProfiles.map(profile => profile.profileId)))
  }

  const toggleOne = (profileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  const openCreateRoot = () => {
    setEditingGroup(null)
    setDefaultParentId('')
    setEditorOpen(true)
  }

  const openCreateChild = (group: BrowserGroupWithCount) => {
    setEditingGroup(null)
    setDefaultParentId(group.groupId)
    setEditorOpen(true)
  }

  const openEdit = (group: BrowserGroupWithCount) => {
    setEditingGroup(group)
    setDefaultParentId(group.parentId || '')
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditingGroup(null)
    setDefaultParentId('')
  }

  const handleEditorSaved = async () => {
    closeEditor()
    await load()
  }

  const handleDeleteGroup = async (group: BrowserGroupWithCount) => {
    const message = group.instanceCount > 0
      ? `确定删除「${group.groupName}」？该分组下 ${group.instanceCount} 个实例会移动到父分组。`
      : `确定删除「${group.groupName}」？子分组会移动到父分组。`
    if (!window.confirm(message)) return

    setSaving(true)
    try {
      await deleteGroup(group.groupId)
      if (selectedGroupId === group.groupId) {
        setSelectedGroupId('')
      }
      toast.success('分组已删除')
      await load()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '删除分组失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleMoveSelected = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return

    setSaving(true)
    try {
      await moveInstancesToGroup(ids, targetGroupId)
      toast.success(`已移动 ${ids.length} 个实例`)
      setSelectedIds(new Set())
      await load()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '移动实例失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full animate-fade-in">
      <GroupPanel
        groups={groups}
        selectedGroupId={selectedGroupId}
        totalCount={profiles.length}
        ungroupedCount={ungroupedCount}
        onSelect={setSelectedGroupId}
        onCreateRoot={openCreateRoot}
        onEdit={openEdit}
        onCreateChild={openCreateChild}
        onDelete={handleDeleteGroup}
      />

      <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">
        <div className="flex items-center justify-between">
          {!embedded ? (
            <div>
              <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">分组管理</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                {selectedGroupLabel}，共 {displayProfiles.length} 个实例
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              {selectedGroupLabel}，共 {displayProfiles.length} 个实例
            </p>
          )}
          <Button size="sm" onClick={openCreateRoot}>
            <Plus className="w-4 h-4" />新建分组
          </Button>
        </div>

        {editorOpen && (
          <GroupEditor
            groups={groups}
            editingGroup={editingGroup}
            defaultParentId={defaultParentId}
            onCancel={closeEditor}
            onSaved={handleEditorSaved}
          />
        )}

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-lg text-sm">
            <span className="text-[var(--color-primary)] font-medium shrink-0">已选 {selectedIds.size} 个</span>
            <Select
              value={targetGroupId}
              onChange={event => setTargetGroupId(event.target.value)}
              options={[
                { value: '', label: '移动到：未分组' },
                ...flattenGroups(groups).map(group => ({
                  value: group.groupId,
                  label: `移动到：${'　'.repeat(group.level)}${group.groupName}`,
                })),
              ]}
              className="w-64"
            />
            <Button size="sm" onClick={handleMoveSelected} loading={saving}>移动实例</Button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <Card padding="none" className="flex-1 overflow-hidden">
          <div className="overflow-auto h-full">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 bg-[var(--color-bg-muted)] w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
                      checked={isAllSelected}
                      ref={element => { if (element) element.indeterminate = isIndeterminate }}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg-muted)] text-left">实例名称</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg-muted)] text-left">当前分组</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg-muted)] text-left">标签</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg-muted)] text-left">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-muted)] bg-[var(--color-bg-surface)]">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-[var(--color-text-muted)]">加载中...</td></tr>
                ) : displayProfiles.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-[var(--color-text-muted)]">暂无实例</td></tr>
                ) : displayProfiles.map(profile => (
                  <tr
                    key={profile.profileId}
                    className={`transition-colors cursor-pointer ${selectedIds.has(profile.profileId) ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-bg-muted)]/50'}`}
                    onClick={() => toggleOne(profile.profileId)}
                  >
                    <td className="px-4 py-3" onClick={event => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
                        checked={selectedIds.has(profile.profileId)}
                        onChange={() => toggleOne(profile.profileId)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">{profile.profileName}</td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{resolveGroupName(groups, profile.groupId)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {profile.tags?.length ? profile.tags.map(tag => (
                          <Badge key={tag} variant="default">{tag}</Badge>
                        )) : <span className="text-xs text-[var(--color-text-muted)]">无标签</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={profile.running ? 'success' : 'warning'} dot>{profile.running ? '运行中' : '已停止'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {saving && (
          <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
            <div className="bg-[var(--color-bg-elevated)] rounded-lg px-6 py-4 text-sm text-[var(--color-text-primary)] shadow-xl">
              保存中...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
