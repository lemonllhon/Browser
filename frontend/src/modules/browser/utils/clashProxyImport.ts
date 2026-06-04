import yaml from 'js-yaml'

export interface ClashProxy {
  name: string
  type: string
  server: string
  port: number
  [key: string]: any
}

export function proxyToYaml(proxy: ClashProxy): string {
  return yaml.dump([proxy], { flowLevel: -1, lineWidth: -1 }).trim()
}

function quoteYamlScalar(value: string): string {
  const v = value.trim()
  if (!v) return "''"
  return `'${v.replace(/'/g, "''")}'`
}

function normalizeImportedProxyArray(payload: unknown): ClashProxy[] | null {
  const asArray = (input: unknown): ClashProxy[] => {
    if (!Array.isArray(input)) return []
    return input.filter((item): item is ClashProxy => !!item && typeof item === 'object')
  }

  if (Array.isArray(payload)) {
    return asArray(payload)
  }
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  if (Array.isArray(record.proxies)) {
    return asArray(record.proxies)
  }
  if (Array.isArray(record.proxy)) {
    return asArray(record.proxy)
  }
  if (Array.isArray(record.Proxy)) {
    return asArray(record.Proxy)
  }
  return null
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function decodeBase64ImportText(raw: string): string | null {
  const candidate = raw.trim().replace(/\s+/g, '')
  if (!candidate || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(candidate)) return null

  const variants = new Set<string>()
  variants.add(candidate)
  const mod = candidate.length % 4
  if (mod !== 0) {
    variants.add(candidate + '='.repeat(4 - mod))
  }

  for (const variant of variants) {
    const normalized = variant.replace(/-/g, '+').replace(/_/g, '/')
    try {
      const binary = atob(normalized)
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
      const decoded = new TextDecoder().decode(bytes).replace(/\r\n/g, '\n').trim()
      if (decoded) return decoded
    } catch {
      // try next variant
    }
  }
  return null
}

function collectClashImportTextAttempts(input: string): string[] {
  const attempts: string[] = []
  const seen = new Set<string>()
  const append = (value: string | null | undefined) => {
    const text = (value || '').replace(/\uFEFF/g, '').replace(/\r\n/g, '\n').trim()
    if (!text || seen.has(text)) return
    seen.add(text)
    attempts.push(text)
  }

  append(input)
  append(safeDecodeURIComponent(input))

  for (const text of [...attempts]) {
    append(decodeBase64ImportText(text))
  }
  return attempts
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function numberValue(value: unknown): number {
  const n = Number(stringValue(value))
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = (value || '').trim()
    if (text) return text
  }
  return ''
}

function setStringField(target: ClashProxy, key: string, value: string | null | undefined) {
  const text = (value || '').trim()
  if (text) target[key] = text
}

function isTruthyParam(value: string | null): boolean {
  const text = (value || '').trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

function shareURLName(url: URL, index: number): string {
  const raw = url.hash ? url.hash.replace(/^#/, '') : ''
  return safeDecodeURIComponent(raw).trim() || `导入代理 ${index + 1}`
}

function applyTransportParams(proxy: ClashProxy, networkValue: string, path = '', host = '', serviceName = '') {
  const network = networkValue.trim().toLowerCase()
  if (!network) return
  proxy.network = network

  if (network === 'ws') {
    const wsOpts: Record<string, unknown> = {}
    if (path.trim()) wsOpts.path = path.trim()
    if (host.trim()) wsOpts.headers = { Host: host.trim() }
    if (Object.keys(wsOpts).length > 0) proxy['ws-opts'] = wsOpts
  }

  if (network === 'grpc') {
    const grpcOpts: Record<string, unknown> = {}
    if (serviceName.trim()) grpcOpts['grpc-service-name'] = serviceName.trim()
    if (Object.keys(grpcOpts).length > 0) proxy['grpc-opts'] = grpcOpts
  }
}

function parseVmessShareURI(raw: string, index: number): ClashProxy | null {
  const decoded = decodeBase64ImportText(raw.slice('vmess://'.length))
  if (!decoded) return null

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }

  const server = stringValue(payload.add)
  const port = numberValue(payload.port)
  const uuid = stringValue(payload.id)
  if (!server || !port || !uuid) return null

  const proxy: ClashProxy = {
    name: firstText(stringValue(payload.ps), `导入代理 ${index + 1}`),
    type: 'vmess',
    server,
    port,
    uuid,
    alterId: numberValue(payload.aid),
    cipher: firstText(stringValue(payload.scy), stringValue(payload.cipher), 'auto'),
  }

  const tls = stringValue(payload.tls).toLowerCase()
  if (tls && tls !== 'none') {
    proxy.tls = true
    setStringField(proxy, 'servername', firstText(stringValue(payload.sni), stringValue(payload.host)))
  }
  setStringField(proxy, 'client-fingerprint', stringValue(payload.fp))
  applyTransportParams(proxy, firstText(stringValue(payload.net), stringValue(payload.network)), stringValue(payload.path), stringValue(payload.host), stringValue(payload.serviceName))
  return proxy
}

function parseUserInfoShareURI(raw: string, index: number, protocol: 'vless' | 'trojan'): ClashProxy | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  const server = parsed.hostname
  const port = Number(parsed.port)
  const user = safeDecodeURIComponent(parsed.username)
  if (!server || !Number.isFinite(port) || port <= 0 || !user) return null

  const q = parsed.searchParams
  const proxy: ClashProxy = {
    name: shareURLName(parsed, index),
    type: protocol,
    server,
    port,
  }
  if (protocol === 'vless') {
    proxy.uuid = user
    setStringField(proxy, 'flow', q.get('flow'))
  } else {
    proxy.password = user
  }

  const security = (q.get('security') || '').toLowerCase()
  if (security === 'tls' || security === 'reality') {
    proxy.tls = true
    setStringField(proxy, 'servername', firstText(q.get('sni'), q.get('peer'), q.get('servername')))
    if (security === 'reality') {
      const realityOpts: Record<string, string> = {}
      if (q.get('pbk')) realityOpts['public-key'] = q.get('pbk') || ''
      if (q.get('sid')) realityOpts['short-id'] = q.get('sid') || ''
      if (Object.keys(realityOpts).length > 0) proxy['reality-opts'] = realityOpts
    }
  }
  setStringField(proxy, 'client-fingerprint', q.get('fp'))
  if (isTruthyParam(q.get('allowInsecure')) || isTruthyParam(q.get('skip-cert-verify'))) {
    proxy['skip-cert-verify'] = true
  }

  applyTransportParams(proxy, firstText(q.get('type'), q.get('network')), q.get('path') || '', q.get('host') || '', q.get('serviceName') || '')
  return proxy
}

function parseSSHostPort(hostPart: string): { server: string; port: number } | null {
  try {
    const parsed = new URL(`ss://${hostPart}`)
    const port = Number(parsed.port)
    if (!parsed.hostname || !Number.isFinite(port) || port <= 0) return null
    return { server: parsed.hostname, port }
  } catch {
    return null
  }
}

function parseSSShareURI(raw: string, index: number): ClashProxy | null {
  let body = raw.slice('ss://'.length).trim()
  let fragment = ''
  const hashIndex = body.indexOf('#')
  if (hashIndex >= 0) {
    fragment = body.slice(hashIndex + 1)
    body = body.slice(0, hashIndex)
  }
  const queryIndex = body.indexOf('?')
  if (queryIndex >= 0) {
    body = body.slice(0, queryIndex)
  }

  let method = ''
  let password = ''
  let endpoint: { server: string; port: number } | null = null

  if (body.includes('@')) {
    const at = body.lastIndexOf('@')
    let userPart = body.slice(0, at)
    const hostPart = body.slice(at + 1)
    userPart = decodeBase64ImportText(userPart) || safeDecodeURIComponent(userPart)
    const parts = userPart.split(/:(.*)/s).filter(Boolean)
    if (parts.length < 2) return null
    method = parts[0].trim()
    password = parts[1].trim()
    endpoint = parseSSHostPort(hostPart)
  } else {
    const decoded = decodeBase64ImportText(body)
    if (!decoded) return null
    const at = decoded.lastIndexOf('@')
    if (at < 0) return null
    const userPart = decoded.slice(0, at)
    const hostPart = decoded.slice(at + 1)
    const parts = userPart.split(/:(.*)/s).filter(Boolean)
    if (parts.length < 2) return null
    method = parts[0].trim()
    password = parts[1].trim()
    endpoint = parseSSHostPort(hostPart)
  }

  if (!method || !password || !endpoint) return null
  return {
    name: safeDecodeURIComponent(fragment).trim() || `导入代理 ${index + 1}`,
    type: 'ss',
    server: endpoint.server,
    port: endpoint.port,
    cipher: method,
    password,
  }
}

function parseAnyTLSShareURI(raw: string, index: number): ClashProxy | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  const server = parsed.hostname
  const port = Number(parsed.port)
  const password = safeDecodeURIComponent(parsed.username || parsed.password || '')
  if (!server || !Number.isFinite(port) || port <= 0 || !password) return null

  const q = parsed.searchParams
  const proxy: ClashProxy = {
    name: shareURLName(parsed, index),
    type: 'anytls',
    server,
    port,
    password,
  }
  setStringField(proxy, 'sni', firstText(q.get('sni'), q.get('peer'), q.get('servername')))
  if (isTruthyParam(q.get('insecure')) || isTruthyParam(q.get('allowInsecure')) || isTruthyParam(q.get('skip-cert-verify'))) {
    proxy['skip-cert-verify'] = true
  }
  const alpn = (q.get('alpn') || '').split(',').map(item => item.trim()).filter(Boolean)
  if (alpn.length > 0) proxy.alpn = alpn
  setStringField(proxy, 'idle-session-check-interval', q.get('idle_session_check_interval'))
  setStringField(proxy, 'idle-session-timeout', q.get('idle_session_timeout'))
  setStringField(proxy, 'min-idle-session', q.get('min_idle_session'))
  return proxy
}

function parseHysteria2ShareURI(raw: string, index: number): ClashProxy | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  const server = parsed.hostname
  const port = Number(parsed.port)
  if (!server || !Number.isFinite(port) || port <= 0) return null

  const q = parsed.searchParams
  const proxy: ClashProxy = {
    name: shareURLName(parsed, index),
    type: 'hysteria2',
    server,
    port,
  }
  setStringField(proxy, 'password', firstText(safeDecodeURIComponent(parsed.username), q.get('auth'), q.get('password')))
  setStringField(proxy, 'sni', firstText(q.get('sni'), q.get('peer'), q.get('servername')))
  if (isTruthyParam(q.get('insecure')) || isTruthyParam(q.get('allowInsecure')) || isTruthyParam(q.get('skip-cert-verify'))) {
    proxy['skip-cert-verify'] = true
  }
  setStringField(proxy, 'obfs', q.get('obfs'))
  setStringField(proxy, 'obfs-password', firstText(q.get('obfs-password'), q.get('obfs_password')))
  setStringField(proxy, 'up', firstText(q.get('up'), q.get('upmbps'), q.get('up_mbps')))
  setStringField(proxy, 'down', firstText(q.get('down'), q.get('downmbps'), q.get('down_mbps')))
  const alpn = (q.get('alpn') || '').split(',').map(item => item.trim()).filter(Boolean)
  if (alpn.length > 0) proxy.alpn = alpn
  return proxy
}

function parseShareURIToClashProxy(raw: string, index: number): ClashProxy | null {
  const value = raw.trim()
  const lower = value.toLowerCase()
  if (lower.startsWith('vmess://')) return parseVmessShareURI(value, index)
  if (lower.startsWith('vless://')) return parseUserInfoShareURI(value, index, 'vless')
  if (lower.startsWith('trojan://')) return parseUserInfoShareURI(value, index, 'trojan')
  if (lower.startsWith('ss://')) return parseSSShareURI(value, index)
  if (lower.startsWith('hysteria2://') || lower.startsWith('hysteria://') || lower.startsWith('hy2://')) return parseHysteria2ShareURI(value, index)
  if (lower.startsWith('anytls://')) return parseAnyTLSShareURI(value, index)
  return null
}

function parseShareSubscriptionText(raw: string): ClashProxy[] | null {
  const proxies: ClashProxy[] = []
  raw.replace(/\r\n/g, '\n').split('\n').forEach(line => {
    const value = line.trim()
    if (!value || value.startsWith('#')) return
    const proxy = parseShareURIToClashProxy(value, proxies.length)
    if (proxy) proxies.push(proxy)
  })
  return proxies.length > 0 ? proxies : null
}

function normalizeLooseClashImportText(raw: string): string {
  const normalizedNewline = raw.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n').trim()
  if (!normalizedNewline) return normalizedNewline

  const lines = normalizedNewline.split('\n')
  const fixedLines = lines.map(line => {
    // 容错: -节点名, type: vless, server: ... => - { name: '节点名', type: vless, server: ... }
    const m = line.match(/^(\s*)-\s*([^,{][^,]*?)\s*,\s*(type\s*:.*)$/i)
    if (!m) return line
    const indent = m[1] || ''
    const name = m[2] || ''
    const tail = m[3] || ''
    return `${indent}- { name: ${quoteYamlScalar(name)}, ${tail.trim()} }`
  })

  const hasProxiesRoot = fixedLines.some(line => /^\s*proxies\s*:/.test(line))
  if (hasProxiesRoot) {
    return fixedLines.join('\n')
  }

  const looksLikeProxyList = fixedLines.some(line => /^\s*-\s*/.test(line))
  if (!looksLikeProxyList) {
    return fixedLines.join('\n')
  }

  const indented = fixedLines.map(line => {
    if (!line.trim()) return line
    return `  ${line}`
  })
  return `proxies:\n${indented.join('\n')}`
}

export function parseClashImportText(raw: string): ClashProxy[] {
  const input = raw.trim()
  if (!input) {
    throw new Error('请输入 YAML 或订阅内容')
  }

  let lastError: unknown = null
  for (const sourceText of collectClashImportTextAttempts(input)) {
    const attempts = [sourceText]
    const normalized = normalizeLooseClashImportText(sourceText)
    if (normalized && normalized !== sourceText) {
      attempts.push(normalized)
    }

    const shareProxies = parseShareSubscriptionText(sourceText)
    if (shareProxies) {
      return shareProxies
    }

    for (const text of attempts) {
      try {
        const parsed = yaml.load(text)
        const proxies = normalizeImportedProxyArray(parsed)
        if (proxies) {
          return proxies
        }
      } catch (error) {
        lastError = error
      }
    }
  }

  if (lastError && typeof lastError === 'object' && lastError !== null && 'message' in lastError) {
    throw new Error(String((lastError as { message?: string }).message || '解析失败'))
  }
  throw new Error('无效的订阅格式，需要包含 proxies 数组，或 Base64/分享链接节点')
}
