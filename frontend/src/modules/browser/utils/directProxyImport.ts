export type DirectProxyProtocol = 'http' | 'https' | 'socks5'

export interface DirectImportForm {
  proxyName: string
  protocol: DirectProxyProtocol
  server: string
  port: string
  username: string
  password: string
}

interface DirectImportLineResult {
  name: string
  config: string
}

export interface ImportCandidate {
  proxyName: string
  proxyConfig: string
}

export const DIRECT_PROXY_PROTOCOL_OPTIONS = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks5', label: 'SOCKS5' },
] as const

export const INITIAL_DIRECT_IMPORT_FORM: DirectImportForm = {
  proxyName: '',
  protocol: 'http',
  server: '',
  port: '',
  username: '',
  password: '',
}

function normalizeDirectProxyConfig(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^socket:\/\//i.test(trimmed)) {
    return trimmed.replace(/^socket:\/\//i, 'socks5://')
  }
  if (/^socks:\/\//i.test(trimmed)) {
    return trimmed.replace(/^socks:\/\//i, 'socks5://')
  }
  return trimmed
}

function formatDirectProxyHost(raw: string): string {
  const host = raw.trim()
  if (!host) return ''
  if (host.startsWith('[') && host.endsWith(']')) {
    return host
  }
  return host.includes(':') ? `[${host}]` : host
}

function resolveDirectProxyName(rawName: string, scheme: string, server: string, port: number, index: number, prefix: string): string {
  const name = rawName.trim()
  const fallbackName = server
    ? `${scheme.toUpperCase()}-${server}${port > 0 ? `:${port}` : ''}`
    : `导入代理 ${index + 1}`
  const finalName = name || fallbackName
  return prefix ? `${prefix}-${finalName}` : finalName
}

function buildDirectProxyConfigFromParts(protocol: DirectProxyProtocol, host: string, portText: string, username = '', password = ''): string {
  const cleanHost = host.trim()
  const cleanPort = portText.trim()
  if (!cleanHost || !cleanPort) {
    throw new Error('缺少主机或端口')
  }
  if (!/^\d+$/.test(cleanPort)) {
    throw new Error('端口必须为数字')
  }
  const port = Number(cleanPort)
  if (port < 1 || port > 65535) {
    throw new Error('端口必须在 1-65535 之间')
  }

  const auth = username.trim()
    ? `${encodeURIComponent(username.trim())}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : ''
  return `${protocol}://${auth}${formatDirectProxyHost(cleanHost)}:${port}`
}

function parseDirectProxyLine(line: string, index: number, defaultProtocol: DirectProxyProtocol): DirectImportLineResult {
  const raw = line.trim()
  if (!raw) {
    throw new Error('代理内容为空')
  }

  const parts = raw.split(/\s+/)
  const first = normalizeDirectProxyConfig(parts[0] || '')
  const explicitName = parts.slice(1).join(' ').trim()
  let candidate = first
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    const colonParts = first.split(':')
    if (colonParts.length >= 2 && colonParts.length <= 4) {
      const [host, port, username = '', password = ''] = colonParts
      try {
        candidate = buildDirectProxyConfigFromParts(defaultProtocol, host, port, username, password)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : ''
        throw new Error(`第 ${index + 1} 行${message ? `：${message}` : '格式无效'}`)
      }
    } else {
      candidate = `${defaultProtocol}://${first}`
    }
  }
  let parsedURL: URL
  try {
    parsedURL = new URL(candidate)
  } catch {
    throw new Error(`第 ${index + 1} 行不是有效代理地址`)
  }

  const scheme = parsedURL.protocol.replace(':', '').toLowerCase()
  if (!['http', 'https', 'socks5'].includes(scheme)) {
    throw new Error(`第 ${index + 1} 行协议不支持，仅支持 HTTP / HTTPS / SOCKS5`)
  }
  const port = Number(parsedURL.port || 0)
  if (!parsedURL.hostname || !port || port < 1 || port > 65535) {
    throw new Error(`第 ${index + 1} 行缺少有效主机或端口`)
  }

  const normalizedConfig = parsedURL.toString().replace(/\/$/, '')
  const host = parsedURL.hostname.replace(/^\[(.*)\]$/, '$1')
  return {
    name: explicitName || resolveDirectProxyName('', scheme, host, port, index, ''),
    config: normalizedConfig,
  }
}

export function parseDirectProxyBatchText(raw: string, defaultProtocol: DirectProxyProtocol): ImportCandidate[] {
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))

  if (lines.length === 0) return []

  return lines.map((line, index) => {
    const result = parseDirectProxyLine(line, index, defaultProtocol)
    return {
      proxyName: result.name,
      proxyConfig: result.config,
    }
  })
}

export function buildDirectImportCandidate(form: DirectImportForm): ImportCandidate {
  const serverInput = form.server.trim()
  if (!serverInput) {
    throw new Error('请输入代理地址')
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(serverInput)) {
    throw new Error('代理地址只需要填写主机名或 IP，不需要协议头')
  }

  const portInput = form.port.trim()
  if (!portInput) {
    throw new Error('请输入代理端口')
  }
  if (!/^\d+$/.test(portInput)) {
    throw new Error('代理端口必须为数字')
  }

  const port = Number(portInput)
  if (port < 1 || port > 65535) {
    throw new Error('代理端口必须在 1-65535 之间')
  }

  const username = form.username.trim()
  const password = form.password
  if (password && !username) {
    throw new Error('填写密码时请同时填写账号')
  }

  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : ''
  const rawConfig = `${form.protocol}://${auth}${formatDirectProxyHost(serverInput)}:${port}`

  let parsedURL: URL
  try {
    parsedURL = new URL(rawConfig)
  } catch {
    throw new Error('请输入有效的代理地址')
  }

  if (!parsedURL.hostname) {
    throw new Error('请输入有效的代理地址')
  }

  const normalizedConfig = normalizeDirectProxyConfig(parsedURL.toString()).replace(/\/$/, '')
  const normalizedServer = parsedURL.hostname.replace(/^\[(.*)\]$/, '$1')

  return {
    proxyName: resolveDirectProxyName(form.proxyName, form.protocol, normalizedServer, port, 0, ''),
    proxyConfig: normalizedConfig,
  }
}
