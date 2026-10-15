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

// 是否处于 Mock 模式（离线演示数据）
//   有 Token            → 真实模式，返回 false
//   无 Token 且未显式关 Mock → Mock 模式，返回 true（便于离线演示完整链路）
//   无 Token 但 ENABLE_MOCK=false → 返回 false，**不静默降级**：
//     此时工具会抛 NO_TOKEN 错误，避免「以为在跑真实接口、其实在看演示数据」的误判
function isMockMode() {
  if (readToken()) return false
  const flag = String(process.env.ENABLE_MOCK || 'true').toLowerCase()
  return flag !== 'false'
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
// 官方实测（mcp.raw 联调）：text 常为「字段说明文字 + 内嵌业务 JSON + 补充说明」的混合体，
// 整段 JSON.parse 会失败 → 必须从中提取平衡的 JSON 子串。
// 业务 JSON 形如 {"success":true/false,"code":200/600058,"message":"...","data":...}，
// success=false 属于业务层错误（HTTP/JSON-RPC 层面仍是成功的）→ 转结构化异常上抛。
function unwrapToolResult(result) {
  const content = (result && result.content) || []
  const texts = content.filter((c) => c && c.type === 'text').map((c) => c.text)
  if (!texts.length) return result || {}
  const joined = texts.join('\n')
  // ① 整段就是纯 JSON：直接解析
  try { return checkBizError(JSON.parse(joined)) } catch (e) { /* 继续提取 */ }
  // ② 混合文本：提取内嵌 JSON
  const obj = extractEmbeddedJson(joined)
  if (obj) return checkBizError(obj)
  return { text: joined } // 真解析不出 JSON 时原样返回文本，不做猜测
}

// 业务层错误检查：success=false → 抛结构化异常（带官方 code/message）
function checkBizError(obj) {
  if (obj && typeof obj === 'object' && obj.success === false) {
    throw mcpError('BIZ_' + (obj.code != null ? obj.code : 'ERR'), obj.message || '官方接口业务错误')
  }
  return obj
}

// 从混合文本提取「括号平衡且含 success 字段」的 JSON 子串
// （说明文字里可能出现孤立花括号，故必须做深度平衡扫描 + 候选 parse 验证）
function extractEmbeddedJson(text) {
  const str = String(text || '')
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '{') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < str.length; j++) {
      const ch = str[j]
      if (esc) { esc = false; continue }
      if (inStr && ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = str.slice(i, j + 1)
          try {
            const parsed = JSON.parse(candidate)
            if (parsed && typeof parsed === 'object' && parsed.success !== undefined) return parsed
          } catch (e) { /* 该平衡段非目标 JSON，继续找下一个 '{' */ }
          break
        }
      }
    }
  }
  return null
}

// 拉取官方工具清单（含 inputSchema）
// 用途：官方 README 只列了工具名，没有公开入参结构。配好 MCP_TOKEN 后，
// 用 mcp-proxy 的 action='mcp.tools' 即可拿到**官方权威的 inputSchema**，
// 据此校正各 tools 模块的入参字段，避免凭猜测写参数。绝不回传任何凭证。
async function listTools() {
  if (!readToken()) throw mcpError('NO_TOKEN', '未配置 MCP_TOKEN，无法获取官方工具清单')
  await ensureSession()
  const result = await post({ jsonrpc: '2.0', id: rpcSeq++, method: 'tools/list', params: {} })
  const tools = (result && result.tools) || []
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema || null
  }))
}

module.exports = {
  ENDPOINT: 'https://' + ENDPOINT_HOST,
  readToken,
  isMockMode,
  callTool,
  listTools,
  mcpError,
  // 仅供测试
  _parseResponse: parseResponse
}
