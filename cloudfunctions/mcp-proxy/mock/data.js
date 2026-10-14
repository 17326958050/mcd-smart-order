// 离线演示数据（Mock）：未配置 MCP_TOKEN 时使用，保证陌生人 clone 后也能直接看到效果
// 重要：单位一律为「元」（字符串）；热量为千卡；数据为演示用途，非官方实时数据
// 说明：价格与餐品为示意值，实际以下单时麦当劳官方渠道返回为准

const stores = [
  { id: 'MOCK-S001', name: '（演示）人民广场店', address: '演示地址 · 南京西路 000 号', distanceMeters: 320 },
  { id: 'MOCK-S002', name: '（演示）中山公园店', address: '演示地址 · 长宁路 000 号', distanceMeters: 780 },
  { id: 'MOCK-S003', name: '（演示）陆家嘴店', address: '演示地址 · 世纪大道 000 号', distanceMeters: 1500 }
]

// 餐品（演示）：category 对应官方 query-meals 返回的「分类」，用于区分主食/配餐
const meals = [
  { id: 'MOCK-M001', name: '（演示）双层吉士汉堡', priceYuan: '21.50', calorie: 450, category: '主食' },
  { id: 'MOCK-M002', name: '（演示）麦辣鸡腿堡', priceYuan: '20.00', calorie: 570, category: '主食' },
  { id: 'MOCK-M003', name: '（演示）板烧鸡腿堡', priceYuan: '22.00', calorie: 440, category: '主食' },
  { id: 'MOCK-M004', name: '（演示）中薯条', priceYuan: '12.00', calorie: 340, category: '配餐' },
  { id: 'MOCK-M005', name: '（演示）可乐（中）', priceYuan: '9.00', calorie: 150, category: '配餐' },
  { id: 'MOCK-M006', name: '（演示）麦旋风', priceYuan: '13.50', calorie: 320, category: '配餐' },
  { id: 'MOCK-M007', name: '（演示）玉米杯', priceYuan: '8.50', calorie: 110, category: '配餐' },
  { id: 'MOCK-M008', name: '（演示）鲜蔬沙拉', priceYuan: '11.00', calorie: 90, category: '配餐' }
]

// 营养信息（与 meals 对应，独立成表，模拟官方 list-nutrition-foods）
const nutrition = meals.map((m) => ({
  mealId: m.id,
  name: m.name,
  calorie: m.calorie,
  protein: 12,
  fat: 15,
  carbohydrate: 40,
  sodium: 600,
  calcium: 100
}))

// 优惠券（演示）：故意构造「标价最低的组合未必最省」的场景
// 券 C001：标价 45 起可用，但必须同时包含「板烧鸡腿堡 + 中薯条 + 麦旋风」
// 券 C002：须买两份双层吉士汉堡（第二份半价，21.50 ÷ 2 = 10.75）
// 于是存在这样的组合：标价更低但用不了券，实付反而更贵 —— 必须实算才看得出来
const coupons = [
  {
    id: 'MOCK-C001',
    name: '（演示）指定套餐满 45 减 12',
    thresholdYuan: '45.00',
    discountYuan: '12.00',
    applicableMealIds: ['MOCK-M003', 'MOCK-M004', 'MOCK-M006']
  },
  {
    id: 'MOCK-C002',
    name: '（演示）双层吉士堡第二份半价',
    thresholdYuan: '0.00',
    discountYuan: '10.75',
    applicableMealIds: ['MOCK-M001', 'MOCK-M001']
  }
]

module.exports = { stores, meals, nutrition, coupons, mock: true }
