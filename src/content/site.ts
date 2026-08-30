export const site = {
  name: '文昊',
  englishName: 'WENHAO',
  availability: 'IN STUDIO · 接受合作',
  contacts: { email: 'hello@wenhao.studio' },
}

export const profile = {
  roles: ['AI 设计师', '电商运营专员', '前端开发设计师'],
  statusTitle: '今天在做什么？',
  status: '整理一套用 AI 加速电商内容生产的轻量工作流，也在给这个小站补充新的故事。',
}

export const commerceHome = {
  title: 'AI 电商视觉，先把策略想清楚。',
  description: '面向 Ozon、Wildberries、抖音与淘宝/天猫，根据产品图生成主图创意、详情页分镜和可执行作图提示词。',
  platforms: [
    { name: 'Ozon', market: 'RU / CROSS-BORDER', focus: '搜索结果页识别与俄语卖点层级' },
    { name: 'Wildberries', market: 'RU / MARKETPLACE', focus: '移动端首图节奏与连续详情叙事' },
    { name: '抖音', market: 'CN / CONTENT', focus: '场景钩子、短链路转化与内容感' },
    { name: '淘宝/天猫', market: 'CN / SHELF', focus: '货架差异化与完整详情页结构' },
  ],
  steps: [
    { number: '01', title: '上传产品资料', detail: '产品图、核心参数和已有卖点，先建立可信的商品事实。' },
    { number: '02', title: '选择市场平台', detail: '按俄罗斯跨境或国内平台的阅读习惯，确定表达重点。' },
    { number: '03', title: '获得主图与详情页方案', detail: '输出创意方向、分镜结构和可直接用于作图的提示词。' },
  ],
  demo: {
    product: '便携式蒸汽熨斗 / Ozon',
    direction: '用「行李箱里的平整秩序」建立出差场景；主图以产品三分之四侧视为视觉锚点，冰灰背景控制跨境货架中的识别度。',
    storyboard: ['出差衣物褶皱场景', '快速出汽场景', '折叠收纳展示', '多面料使用场景', '使用步骤与安全提醒'],
    prompt: 'Premium marketplace product photography, compact travel garment steamer in three-quarter view, cool graphite background, precise soft rim light, subtle steam trail, clean negative space for Russian headline, realistic materials, restrained commercial composition, no logo, no text.',
  },
}

export const projects = [
  {
    number: '01',
    type: 'COMMERCE LAB',
    title: '内容增长实验室',
    summary: '将选品、脚本、素材与复盘串成一条更轻的内容生产路径。',
    tags: ['AI 工作流', '内容策略', '运营'],
    visual: 'orbit',
    state: 'ARCHIVED',
  },
  {
    number: '02',
    type: 'BRAND SIGNAL',
    title: '品牌的第一次相遇',
    summary: '用信息结构和视觉语言，重新组织品牌被理解的方式。',
    tags: ['品牌体验', '视觉系统'],
    visual: 'poster',
    state: 'IN VIEW',
  },
  {
    number: '03',
    type: 'WEB CRAFT',
    title: '有呼吸感的页面',
    summary: '把设计意图准确落进网页，让动效、性能和阅读节奏在同一边。',
    tags: ['React', '前端实现'],
    visual: 'terminal',
    state: 'BUILDING',
  },
]

export const experiments = [
  ['NOTE / 01', 'AI 不替代设计，它让判断更快抵达现场', '设计实践'],
  ['NOTE / 02', '电商内容的关键，是让每一步都有下一步', '运营观察'],
  ['NOTE / 03', '把设计做进前端之后，细节才真正有了重量', '开发记录'],
]

export const skills = ['AI 创意', '品牌体验', '内容增长', '界面设计', 'React', '工作流']
