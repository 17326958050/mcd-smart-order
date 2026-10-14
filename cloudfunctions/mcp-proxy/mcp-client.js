// MCP 连接模块：麦当劳 MCP Server（Streamable HTTP + JSON-RPC 2.0）
// 依赖：仅 Node 原生 https，无第三方依赖
//
// 安全与稳定性约定（与项目红线一致）：
// 1. Token 只从云函数环境变量 MCP_TOKEN 读取，绝不落文件、绝不回传前端
// 2. 401（Token 无效/过期/未提供）：不重试，直接报错，提示重新配置凭证
// 3. 429（官方限流 600 次/分钟）：退避后仅重试 1 次，仍失败则报错提示稍后再试
// 4. 单次请求超时 10 秒（对齐 mcp-config.example.json 的 timeout_ms）
const https = require('https')

const ENDPOINT_HOST = 'mcp.mcd.cn'
const ENDPOINT_PATH = '/'
const PROTOCOL_VERSION = '2024-11-05' // MCP 协议版本
const CLIENT_INFO = { name: 'mcd-smart-order-mcp-proxy', version: '1.0.0' }
const DEFAULT_TIMEOUT_MS = 10000
const BACKOFF_MS = 500

// 容器复用时可跨请求保持会话（官方要求 initialize 后携带 mcp-session-id）
let sessionId = null
let rpcSeq = 1

// 读取 Token：只认环境变量
function readToken() {
  const t = process.env.MCP_TOKEN
  return t && String(t).trim() ? String(t).trim() : ''
}

// 是否处于 Mock 模式：无 Token 且未显式关闭 Mock
function isMockMode() {
  if (String(process.env.ENABLE_MOCK || 'true') === 'false') return !readToken()
  return !readToken()
}

// 结构化错误
function mcpError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

// 单次 HTTP POST（JSON-RPC）
function post(body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const token = readToken()
    const payload = JSON.stringify(body)
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(payload)
    }
    if (token) headers.Authorization = 'Bearer ' + token
    if (sessionId) headers['mcp-session-id'] = sessionId

    const req = https.request(
      { hostname: ENDPOINT_HOST, path: ENDPOINT_PATH, method: 'POST', headers },
      (res) => {
        // 401：不重试
        if (res.statusCode === 401) {
          res.resume()
          return reject(mcpError('401', 'MCP 凭证无效或已过期，请重新配置 MCP_TOKEN'))
        }
        // 429：限流，由上层决定是否退避重试
        if (res.statusCode === 429) {
          res.resume()
          return reject(mcpError('429', '请求过于频繁（官方限流 600 次/分钟），请稍后再试'))
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          return reject(mcpError(String(res.statusCode), 'MCP 返回异常状态码 ' + res.statusCode))
        }
        // 记录会话 ID
        if (res.headers['mcp-session-id']) sessionId = res.headers['mcp-session-id']

        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (c) => { raw += c })
        res.on('end', () => {
          try {
            resolve(parseResponse(raw, res.headers['content-type'] || ''))
          } catch (e) {
            reject(mcpError('PARSE', 'MCP 响应解析失败：' + e.message))
          }
        })
      }
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(mcpError('TIMEOUT', 'MCP 请求超时（' + timeoutMs + 'ms）'))
    })
    req.on('error', (e) => reject(e.code ? e : mcpError('NETWORK', 'MCP 网络异常：' + e.message)))
    req.write(payload)
    req.end()
  })
}

// 解析响应：兼容 application/json 与 text/event-stream(SSE)
function parseResponse(raw, contentType) {
  const text = String(raw || '').trim()
  if (!text) return {}
  let jsonText = text
  if (contentType.indexOf('text/event-stream') >= 0) {
    // 取最后一条 data: 行的内容（SSE 可能包含多事件）
    const lines = text.split(/\r?\n/).filter((l) => l.startsWith('data:'))
    if (!lines.length) return {}
    jsonText = lines[lines.length - 1].replace(/^data:\s*/, '')
  }
  const msg = JSON.parse(jsonText)
  if (msg.error) {
    throw mcpError(msg.error.code != null ? String(msg.error.code) : 'RPC', msg.error.message || 'MCP 返回错误')
  }
  return msg.result
}

// 初始化会话（幂等）
async function ensureSession() {
  if (sessionId) return
  await post({
    jsonrpc: '2.0',
    id: rpcSeq++,
    method: 'initialize',
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }
  })
  // 按协议发送 initialized 通知（无 id，不等待结果）
  try {
    await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  } catch (e) {
    // 通知失败不影响后续调用
  }
}

// 调用官方工具：name 为官方工具名（如 query-meals）
// 返回：解析后的业务数据（官方多以 content[].text 承载 JSON 字符串）
async function callTool(name, args = {}) {
  if (!readToken()) throw mcpError('NO_TOKEN', '未配置 MCP_TOKEN，无法调用真实接口')

  await ensureSession()

  const doCall = () =>
    post({
      jsonrpc: '2.0',
      id: rpcSeq++,
      method: 'tools/call',
      params: { name, arguments: args }
    })

  let result
  try {
    result = await doCall()
  } catch (e) {
    // 429：退避 500ms 后仅重试 1 次；401 绝不重试
    if (e.code === '429') {
      await new Promise((r) => setTimeout(r, BACKOFF_MS))
      result = await doCall()
    } else {
      throw e
    }
  }

  return unwrapToolResult(result)
}

// 解包工具返回：优先解析 content[].text 中的 JSON
function unwrapToolResult(result) {
  const content = (result && result.content) || []
  const texts = content.filter((c) => c && c.type === 'text').map((c) => c.text)
  if (!texts.length) return result || {}
  const joined = texts.join('\n')
  try {
    return JSON.parse(joined)
  } catch (e) {
    return { text: joined } // 非 JSON 时原样返回文本，不做猜测
  }
}

module.exports = {
  ENDPOINT: 'https://' + ENDPOINT_HOST,
  readToken,
  isMockMode,
  callTool,
  mcpError,
  // 仅供测试
  _parseResponse: parseResponse
}
