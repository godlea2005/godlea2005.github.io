import type { ArticleSummary, ProjectSummary, VisualNote } from './types'

export type { Article, ArticleBlock, ArticleSummary, Project, ProjectSummary, VisualNote } from './types'

export const articleSummaries: ArticleSummary[] = [
  {
    slug: 'ai-speeds-up-judgment',
    title: 'AI 不替代设计，它让判断更快抵达现场',
    excerpt: '把 AI 放进设计流程，不是把决定交给模型，而是更快看见选项、验证方向，再由人做出取舍。',
    date: '2026-10-21',
    readingMinutes: 5,
    tags: ['AI 设计', '设计判断', '工作流'],
    featured: true,
  },
  {
    slug: 'commerce-every-step-has-a-next-step',
    title: '电商内容的关键，是让每一步都有下一步',
    excerpt: '从首图到详情页，内容不是彼此孤立的版面；每一屏都应回答一个问题，并自然引出下一步。',
    date: '2026-10-21',
    readingMinutes: 6,
    tags: ['电商内容', '信息设计', '运营'],
    featured: true,
  },
  {
    slug: 'design-becomes-real-in-frontend',
    title: '把设计做进前端之后，细节才真正有了重量',
    excerpt: '当设计进入浏览器，响应、动效、加载和可访问性都会成为体验的一部分，而不是交付后的附注。',
    date: '2026-10-21',
    readingMinutes: 5,
    tags: ['前端设计', '交互', '性能'],
    featured: true,
  },
]

export const projectSummaries: ProjectSummary[] = [
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
  },
]

export const visualNotes: VisualNote[] = [
  {
    id: 'signal-desk',
    image: '/images/field-notes/signal-desk.webp',
    alt: '俯拍的哑光黑桌面上铺着半透明网格膜与空白笔记本，屏幕投下紫色微光，一枚酸绿色指示灯亮起',
    caption: '网格、空白笔记本与一点状态光，留下内容工作流开始前的安静桌面。',
    date: '2026-10-21',
    ratio: 'landscape',
  },
  {
    id: 'paper-systems',
    image: '/images/field-notes/paper-systems.webp',
    alt: '暖白折叠纸张与磨砂亚克力片错落摆放，金属夹固定纸面，柔和紫影旁有一枚绿色小针',
    caption: '折纸、亚克力与金属夹构成的材质静物，记录品牌触感的视觉线索。',
    date: '2026-10-18',
    ratio: 'portrait',
  },
  {
    id: 'night-interface',
    image: '/images/field-notes/night-interface.webp',
    alt: '深墨色房间里，玻璃屏幕反射出抽象界面光线，没有可辨认的文字或界面内容',
    caption: '玻璃上的抽象界面反光，不给出具体答案，只保留夜色里的视觉信号。',
    date: '2026-10-15',
    ratio: 'square',
  },
  {
    id: 'prototype-hands',
    image: '/images/field-notes/prototype-hands.webp',
    alt: '没有可读文字的纸卡、产品轮廓草图与材质样片旁，一双匿名的手正在调整排列',
    caption: '用空白卡片、产品轮廓和材质样片，在桌面上推敲内容的先后关系。',
    date: '2026-10-12',
    ratio: 'landscape',
  },
  {
    id: 'material-study',
    image: '/images/field-notes/material-study.webp',
    alt: '铬金属、磨砂玻璃与纸张样本组成的静物，一缕酸绿色线穿过其中',
    caption: '铬、磨砂玻璃与纸张的冷暖对照，由一缕绿色线索连接起来。',
    date: '2026-10-09',
    ratio: 'portrait',
  },
  {
    id: 'quiet-window',
    image: '/images/field-notes/quiet-window.webp',
    alt: '雨中的工作室窗面映出紫色城市灯影，远处有一个无法辨认的模糊人影',
    caption: '雨窗与城市倒影之间，模糊的人影保留了工作室夜晚的距离感。',
    date: '2026-10-06',
    ratio: 'square',
  },
]
