// 需求解析云函数：把一句话需求转为结构化条件（预算/热量/忌口/人数）
// 安全原则：自然语言属于不可信输入 —— 先清洗、限长，再进入解析；
// 禁止把用户原文直接拼进任何系统指令或提示词。
const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d5gheb18zd0b42967' })

const MAX_LEN = 200 // 与前端 chat-bar 的 maxlength 保持一致

// 清洗：截断超长 + 去控制字符/注入片段
function sanitize(input) {
  let s = String(input == null ? '' : input)
  s = s.replace(/[\u0000-\u001F\u007F]/g, '')       // 控制字符
  s = s.replace(/[`${}\\]/g, '')                      // 常见指令拼接符号
  s = s.replace(/(ignore|忽略|无视)\s*(以上|前面|上述)?\s*(所有|一切)?\s*(指令|规则|提示)/gi, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s.slice(0, MAX_LEN)
}

// 结构化解析：TODO(第 3 步 实现完整的规则/词表解析)
// 返回结构固定，前端与推荐逻辑依赖此契约：
// { budgetYuan: '80', maxCalorie: 1200, avoidText: '辣', avoidKeywords: ['辣'], people: 2, raw: '清洗后的原文' }
function parseConditions(text) {
  return {
    budgetYuan: null,   // TODO: 提取「预算 X 元」
    maxCalorie: null,   // TODO: 提取「热量不超过 X 千卡」
    avoidText: '',      // TODO: 提取忌口
    avoidKeywords: [],  // TODO: 转换为过滤关键词
    people: 1,          // TODO: 提取人数，默认 1
    raw: text
  }
}

exports.main = async (event = {}) => {
  const clean = sanitize(event.text)
  if (!clean) return { ok: false, code: 'EMPTY', error: '需求内容为空' }
  const conditions = parseConditions(clean)
  return { ok: true, conditions }
}
