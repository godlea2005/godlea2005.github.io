export type ToolCategoryId = 'ai-create' | 'cross-border' | 'image-assets' | 'workflow-dev' | 'inspiration'

export type ToolLink = {
  id: string
  name: string
  href: string
  host: string
  description: string
  note: string
  tags: string[]
  mark: string
}

export type ToolCategory = {
  id: ToolCategoryId
  number: string
  title: string
  description: string
  tools: ToolLink[]
}

export type ToolFilter = {
  query: string
  category: ToolCategoryId | 'all'
}

export type ToolCategoryOption = {
  id: ToolCategoryId | 'all'
  label: string
}

export const toolCategories: ToolCategory[] = [
  {
    id: 'ai-create',
    number: '01',
    title: 'AI 创作',
    description: '把模糊的想法变成文字、图像与可以继续打磨的初稿。',
    tools: [
      {
        id: 'chatgpt',
        name: 'ChatGPT',
        href: 'https://chatgpt.com/',
        host: 'chatgpt.com',
        description: '用于头脑风暴、写作、学习、规划与代码协作的 AI 助手。',
        note: '我会先用它梳理方向，再把值得做的想法变成清晰的下一步。',
        tags: ['AI', '写作', '灵感', '代码'],
        mark: 'GPT',
      },
      {
        id: 'midjourney',
        name: 'Midjourney',
        href: 'https://www.midjourney.com/',
        host: 'midjourney.com',
        description: '从文字提示探索图像与视频创作的视觉模型。',
        note: '我会用它快速探索视觉方向，再挑选值得继续完善的方案。',
        tags: ['AI', '图像生成', '视觉', '创作'],
        mark: 'MJ',
      },
    ],
  },
  {
    id: 'cross-border',
    number: '02',
    title: '跨境协作',
    description: '处理多语言沟通与跨地区的日常事务，让协作少一点摩擦。',
    tools: [
      {
        id: 'deepl',
        name: 'DeepL',
        href: 'https://www.deepl.com/translator',
        host: 'deepl.com',
        description: '翻译文字与文档，帮助跨语言沟通更自然。',
        note: '我会用它先理解外语资料，再回看原文确认重要细节。',
        tags: ['翻译', '多语言', '文档', '跨境'],
        mark: 'DL',
      },
      {
        id: 'wise',
        name: 'Wise',
        href: 'https://wise.com/',
        host: 'wise.com',
        description: '面向个人与企业的国际汇款和多币种账户服务。',
        note: '我会用它比较跨币种转账的费用与到账信息，再决定如何汇款。',
        tags: ['汇款', '多币种', '国际支付', '跨境'],
        mark: 'W',
      },
    ],
  },
  {
    id: 'image-assets',
    number: '03',
    title: '图像与素材',
    description: '从图片编辑到视觉素材，补齐页面与内容创作需要的画面。',
    tools: [
      {
        id: 'photopea',
        name: 'Photopea',
        href: 'https://www.photopea.com/',
        host: 'photopea.com',
        description: '在浏览器里编辑照片、图层与常见图像文件。',
        note: '我会用它裁切图片、调整尺寸，或快速处理分层素材。',
        tags: ['图片', '图像编辑', '设计', 'PSD'],
        mark: 'P',
      },
      {
        id: 'unsplash',
        name: 'Unsplash',
        href: 'https://unsplash.com/',
        host: 'unsplash.com',
        description: '浏览来自摄影师社区的照片与视觉素材。',
        note: '我会从这里寻找页面配图灵感，并在使用前核对素材许可。',
        tags: ['图片', '照片', '素材', '灵感'],
        mark: 'U',
      },
    ],
  },
  {
    id: 'workflow-dev',
    number: '04',
    title: '工作流与开发',
    description: '从代码协作到网站发布，让小项目也能有顺畅的交付流程。',
    tools: [
      {
        id: 'github',
        name: 'GitHub',
        href: 'https://github.com/',
        host: 'github.com',
        description: '托管代码，并协作规划、构建和交付软件。',
        note: '我会把代码与讨论放在一起，方便追踪每次改动的来龙去脉。',
        tags: ['代码', '协作', '版本管理', '开发'],
        mark: 'GH',
      },
      {
        id: 'vercel',
        name: 'Vercel',
        href: 'https://vercel.com/',
        host: 'vercel.com',
        description: '为前端项目提供开发工作流、预览与部署平台。',
        note: '我会用它预览和发布网站，让每次提交都能尽快被验证。',
        tags: ['开发', '部署', '网站', '工作流'],
        mark: 'V',
      },
    ],
  },
  {
    id: 'inspiration',
    number: '05',
    title: '灵感与阅读',
    description: '收集值得回看的想法与文章，让灵感在整理和阅读中慢慢连接。',
    tools: [
      {
        id: 'arena',
        name: 'Are.na',
        href: 'https://www.are.na/',
        host: 'are.na',
        description: '保存、整理并连接网页、图片、笔记等内容。',
        note: '我会把零散的参考资料放进频道，慢慢整理出新的关联。',
        tags: ['灵感', '收藏', '研究', '整理'],
        mark: 'A',
      },
      {
        id: 'readwise-reader',
        name: 'Readwise Reader',
        href: 'https://read.readwise.io/',
        host: 'read.readwise.io',
        description: '集中保存和阅读文章、电子书及其他长内容。',
        note: '我会把稍后读的文章收在一起，并留下值得回看的标注。',
        tags: ['阅读', '文章', '稍后读', '标注'],
        mark: 'R',
      },
    ],
  },
]

export const toolCategoryOptions: ToolCategoryOption[] = [
  { id: 'all', label: '全部' },
  ...toolCategories.map(({ id, title }) => ({ id, label: title })),
]

export const filterToolCategories = (categories: ToolCategory[], { query, category }: ToolFilter) => {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return categories
    .filter((item) => category === 'all' || item.id === category)
    .map((item) => ({
      ...item,
      tools: item.tools.filter((tool) =>
        [tool.name, tool.host, tool.description, tool.note, ...tool.tags]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(normalized),
      ),
    }))
    .filter((item) => item.tools.length > 0)
}
