// 需求解析云函数：把一句话需求转为结构化条件（预算/热量/忌口/人数）
// 安全原则（项目红线）：
//   1. 自然语言属于不可信输入 —— 先清洗、限长，再进入解析
//   2. 本函数使用**纯规则解析（正则 + 词表）**，不调用任何大模型，
//      因此用户原文永远不会进入任何系统指令或提示词，从机制上杜绝提示词注入
//   3. 无法识别的字段一律返回 null / 空数组，**不猜测、不兜底编造**
// 返回契约（前端 recommend 页依赖，不可改名）：
//   { budgetYuan: '80' | null, maxCalorie: 1200 | null,
//     avoidText: '辣' | '', avoidKeywords: ['辣'], people: 2, raw: '清洗后的原文' }
const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d5gheb18zd0b42967' })

const MAX_LEN = 200 // 与前端 chat-bar 的 maxlength 保持一致

// 取值范围保护：超出常识区间的视为解析失败，返回 null（不猜）
const BUDGET_MIN = 1
const BUDGET_MAX = 10000
const CALORIE_MIN = 50
const CALORIE_MAX = 5000
const PEOPLE_MIN = 1
const PEOPLE_MAX = 20

// ============ 1. 清洗（不可信输入的第一道闸门）============
function sanitize(input) {
  let s = String(input == null ? '' : input)
  s = s.replace(/[\u0000-\u001F\u007F]/g, '')                 // 控制字符
  s = s.replace(/[`${}\\]/g, '')                              // 常见指令拼接符号
  s = s.replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '')              // HTML/XML 标签
  s = s.replace(/(ignore|忽略|无视)\s*(以上|前面|上述)?\s*(所有|一切)?\s*(指令|规则|提示)/gi, '')
  s = s.replace(/(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?|messages?)/gi, '')
  s = s.replace(/(system|assistant|user)\s*[:：]/gi, '')       // 角色扮演标记
  s = s.replace(/\s+/g, ' ').trim()
  return s.slice(0, MAX_LEN)
}

// ============ 2. 中文数字 ============
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
function toNum(s) {
  if (s == null) return null
  const t = String(s).trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  if (CN_NUM[t] != null) return CN_NUM[t]
  if (/^十[一二三四五六七八九]$/.test(t)) return 10 + CN_NUM[t[1]]
  if (/^[一二三四五六七八九]十$/.test(t)) return CN_NUM[t[0]] * 10
  return null
}

// 命中后把该片段抹掉，避免同一串数字被二次误读（如把「1200 千卡」当成预算）
function consume(text, regex) {
  let hit = null
  const out = text.replace(regex, (m, g1) => {
    if (hit == null && g1 != null) hit = g1
    return ' '.repeat(m.length)
  })
  return { text: out, hit }
}

function clampOrNull(n, min, max) {
  if (n == null) return null
  const v = Number(n)
  if (Number.isNaN(v) || v < min || v > max) return null
  return v
}

// ============ 3. 解析主流程 ============
function parseConditions(text) {
  let rest = text
  const notes = []

  // ---- 3.1 热量上限（先做，避免与预算数字混淆）----
  // 支持：「热量不超过 1200 千卡」「热量别超 1200」「1200 大卡以内」「卡路里 < 1000」
  let maxCalorie = null
  let r
  r = consume(rest, /(?:热量|卡路里|kcal|千卡|大卡)[^0-9]{0,8}(\d{2,5})/i)
  rest = r.text
  if (r.hit != null) maxCalorie = toNum(r.hit)
  if (maxCalorie == null) {
    r = consume(rest, /(\d{2,5})\s*(?:千卡|大卡|kcal|卡路里)/i)
    rest = r.text
    if (r.hit != null) maxCalorie = toNum(r.hit)
  }
  maxCalorie = clampOrNull(maxCalorie, CALORIE_MIN, CALORIE_MAX)

  // ---- 3.2 预算上限 ----
  // 支持：「预算 80」「预算 80 元以内」「80 元以内」「不超过 60 块」「60 元封顶」
  let budgetYuan = null
  r = consume(rest, /(?:预算|人均|总价|花费)[^0-9]{0,6}(\d+(?:\.\d+)?)/)
  rest = r.text
  if (r.hit != null) budgetYuan = toNum(r.hit)
  if (budgetYuan == null) {
    r = consume(rest, /(\d+(?:\.\d+)?)\s*(?:元|块钱|块)\s*(?:以内|以下|之内|以里|左右|封顶|上限)?/)
    rest = r.text
    if (r.hit != null) budgetYuan = toNum(r.hit)
  }
  if (budgetYuan == null) {
    r = consume(rest, /(?:不超过|最多|封顶|控制在)[^0-9]{0,4}(\d+(?:\.\d+)?)/)
    rest = r.text
    if (r.hit != null) budgetYuan = toNum(r.hit)
  }
  budgetYuan = clampOrNull(budgetYuan, BUDGET_MIN, BUDGET_MAX)

  // ---- 3.3 人数 ----
  // 支持：「2 个人」「两个人」「单人」「双人」「3 人份」
  let people = null
  r = consume(rest, /(\d+|[一二两三四五六七八九十])\s*(?:个)?\s*人/)
  rest = r.text
  if (r.hit != null) people = toNum(r.hit)
  if (people == null) {
    if (/双人|两人|二人/.test(text)) people = 2
    else if (/单人|一人|一个人|自己/.test(text)) people = 1
  }
  people = clampOrNull(people, PEOPLE_MIN, PEOPLE_MAX)
  if (people == null) { people = 1; notes.push('未识别到人数，按 1 人计算') }

  // ---- 3.4 忌口 ----
  // 提取触发词后的短语，再经词表归一为「可用于餐品名过滤」的关键词
  const avoidRaw = []
  // 触发词可后接标点（「忌口：辣」）；捕获到的短语还要按「触发词 / 和跟与及、」再切分，
  // 以正确处理连写（如「不要辣不要芝士」→ ['辣','芝士']）
  const TRIGGER_SRC = '不要|不吃|不想吃|不能吃|不喜欢|忌口|忌食|忌|别放|别加|别给|不加|不放|去掉|去|免|过敏|少放'
  const reAvoid = new RegExp('(?:' + TRIGGER_SRC + ')\\s*[:：,，、]?\\s*([\\u4e00-\\u9fa5A-Za-z]{1,8})', 'g')
  const reSplit = new RegExp('(?:' + TRIGGER_SRC + ')|[和跟与及、]|还有')
  const TRIGGER_TAIL = ['口', '食', '的', '了', '人', '东西', '啥', '什么']
  let m
  while ((m = reAvoid.exec(text)) !== null) {
    const w = m[1].replace(/(的|了|吧|啊|呀|哦|么)$/, '').trim()
    if (!w || TRIGGER_TAIL.indexOf(w) >= 0) continue
    w.split(reSplit).forEach((p) => {
      const t = p.trim()
      if (t && TRIGGER_TAIL.indexOf(t) < 0 && avoidRaw.indexOf(t) < 0) avoidRaw.push(t)
    })
    if (avoidRaw.length >= 8) break
  }
  const avoidKeywords = normalizeAvoid(avoidRaw)
  const avoidText = avoidRaw.length ? avoidRaw.join('、') : ''

  return {
    budgetYuan: budgetYuan == null ? null : String(budgetYuan), // 元字符串，与价格单位规则一致
    maxCalorie,
    avoidText,
    avoidKeywords,
    people,
    raw: text,
    notes
  }
}

// 忌口词表：把用户口语归一为「能命中餐品名称」的过滤关键词
// 说明：本表只覆盖常见忌口；命中不了的词原样保留在 avoidText 中展示给用户，
//       不做过度联想（避免误过滤），真实门店餐品名以 query-meals 返回为准。
const AVOID_MAP = [
  { key: '辣', test: /辣|麻辣|香辣|辣椒/ },
  { key: '冰', test: /冰|冷饮|冰镇/ },
  { key: '牛肉', test: /牛/ },
  { key: '猪', test: /猪|培根|火腿/ },
  { key: '鸡', test: /鸡/ },
  { key: '鱼', test: /鱼|海鲜|虾|蟹/ },
  // 关键词以「麦当劳餐品名中实际出现的写法」为准，才能命中过滤
  // 例：芝士 → 归一为「吉士」（麦当劳菜单写作「双层吉士汉堡」）
  { key: '吉士', test: /芝士|奶酪|吉士|奶/ },
  { key: '油炸', test: /油炸|炸|煎/ },
  { key: '洋葱', test: /洋葱/ },
  { key: '酸黄瓜', test: /酸黄瓜|黄瓜/ },
  { key: '生菜', test: /生菜|菜/ },
  { key: '蛋', test: /蛋/ },
  { key: '咖啡', test: /咖啡|咖啡因/ },
  { key: '糖', test: /糖|甜/ },
  // 否定期望：明确表示没有忌口时，不产生过滤词
  { key: '', test: /^(无|没有|没|什么都行|不忌口|都可以)$/ }
]

function normalizeAvoid(words) {
  const out = []
  words.forEach((w) => {
    const hit = AVOID_MAP.find((x) => x.test.test(w))
    if (!hit || !hit.key) return // 未命中词表或明确「无忌口」→ 不产生过滤词，避免误杀
    if (out.indexOf(hit.key) < 0) out.push(hit.key)
  })
  return out
}

exports.main = async (event = {}) => {
  const clean = sanitize(event && event.text)
  if (!clean) return { ok: false, code: 'EMPTY', error: '需求内容为空' }
  const conditions = parseConditions(clean)
  return { ok: true, conditions }
}

// 暴露给测试（本地单测用，云函数运行时不影响）
exports._sanitize = sanitize
exports._parseConditions = parseConditions
