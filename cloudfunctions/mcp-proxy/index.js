const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d5gheb18zd0b42967' })
const db = cloud.database()
exports.main = async (event = {}, context) => {
  const action = (event && event.action) || ''
  const wxContext = cloud.getWXContext()
  const openid = String(wxContext.OPENID || '')
  const appid  = String(wxContext.APPID  || '')
  if (action === 'ping') {
    return { ok: true, env: process.env.MY_ENV_ID || 'env-not-set',
             openid, appid, timestamp: Date.now() }
  }
  return { ok: false, error: 'unknown action', action }
}
