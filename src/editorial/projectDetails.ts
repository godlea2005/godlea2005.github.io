import type { Project } from './types'

const projects: Project[] = [
  {
    slug: 'content-growth-lab',
    title: '内容增长实验室',
    summary: '将选品、脚本、素材与复盘串成一条更轻的内容生产路径。',
    role: '个人实验：内容策略与 AI 工作流设计',
    period: '2026',
    tags: ['AI 工作流', '内容策略', '运营'],
    cover: '/images/field-notes/signal-desk.webp',
    coverAlt: '俯拍的哑光黑桌面上铺着半透明网格膜与空白笔记本，屏幕投下紫色微光，一枚酸绿色指示灯亮起',
    kind: 'personal-experiment',
    challenge: '探索如何让选品判断、内容构思、素材准备和复盘彼此衔接，同时保留人工核对商品事实与表达方向的空间。',
    process: [
      '把选品信息、目标受众与内容目标整理成可复用的输入清单。',
      '用 AI 展开脚本和表达方向，再按平台语境筛选与改写。',
      '建立素材归档和复盘问题，让每轮尝试都能留下可读记录。',
    ],
    outcome: '形成了一套更容易检查和迭代的个人内容工作流草案，也明确了需要由人把关的节点。',
  },
  {
    slug: 'brand-first-encounter',
    title: '品牌的第一次相遇',
    summary: '用信息结构和视觉语言，重新组织品牌被理解的方式。',
    role: '个人实验：品牌体验与视觉系统设计',
    period: '2026',
    tags: ['品牌体验', '视觉系统'],
    cover: '/images/field-notes/paper-systems.webp',
    coverAlt: '暖白折叠纸张与磨砂亚克力片错落摆放，金属夹固定纸面，柔和紫影旁有一枚绿色小针',
    kind: 'personal-experiment',
    challenge: '尝试回答一个新品牌如何在有限的首次接触中说清自己，同时避免视觉风格盖过真实信息。',
    process: [
      '梳理品牌希望传达的性格、受众问题与可信依据。',
      '通过色彩、字体和版式草图比较不同的表达语气。',
      '将选定的视觉规则放入介绍页面和内容样例中检查一致性。',
    ],
    outcome: '整理出一套从信息优先级到视觉细节相互支撑的品牌表达练习，并记录了后续可验证的问题。',
  },
  {
    slug: 'breathing-room-web',
    title: '有呼吸感的页面',
    summary: '把设计意图准确落进网页，让动效、性能和阅读节奏在同一边。',
    role: '个人实验：界面设计与前端实现',
    period: '2026',
    tags: ['React', '前端实现'],
    cover: '/images/field-notes/night-interface.webp',
    coverAlt: '深墨色房间里，玻璃屏幕反射出抽象界面光线，没有可辨认的文字或界面内容',
    kind: 'personal-experiment',
    challenge: '练习让留白、层级和动效在不同屏幕尺寸下保持阅读节奏，并避免视觉效果影响内容加载与操作。',
    process: [
      '先定义页面信息层级与宽窄屏下的内容顺序。',
      '用组件实现布局和交互状态，并以真实内容检查边界情况。',
      '减少不必要的动效与资源负担，再回到浏览器校对细节。',
    ],
    outcome: '完成了一组可在浏览器中验证的页面实现，也把性能、可访问性和响应规则纳入了视觉检查清单。',
  },
]

export const findProject = (slug: string): Project | undefined => projects.find((project) => project.slug === slug)
