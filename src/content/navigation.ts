import { site } from './site'
import { articleSummaries, projectSummaries } from '../editorial'
import { toolCategories } from './tools'

export type NavigationDestination = Readonly<{
  title: string
  href: string
  detail: string
}>

export type NavigationGroup = Readonly<{
  id: 'reading' | 'explore' | 'connect'
  title: string
  index: string
  destinations: readonly NavigationDestination[]
}>

export const navigationGroups: readonly NavigationGroup[] = [
  {
    id: 'reading',
    title: '阅读',
    index: '01',
    destinations: [
      { title: '文章', href: '#featured', detail: '设计、内容与技术实践' },
      { title: '现场笔记', href: '#visual-notes', detail: '正在发生的观察' },
      { title: '归档', href: '#writing', detail: '文章与笔记索引' },
    ],
  },
  {
    id: 'explore',
    title: '探索',
    index: '02',
    destinations: [
      { title: '作品', href: '#work', detail: '项目与设计实践' },
      { title: 'AI 电商实验室', href: '#ai-commerce', detail: '产品分析与视觉方案' },
      { title: '工具导航', href: '#tools', detail: '常用工具与工作流入口' },
    ],
  },
  {
    id: 'connect',
    title: '连接',
    index: '03',
    destinations: [
      { title: '留言', href: '#guestbook', detail: '留下想法，交流近况' },
      { title: '音乐', href: '#music', detail: '音乐与声音可视化' },
      { title: '关于与联系', href: '#about', detail: `了解这个空间 · ${site.contacts.email}` },
    ],
  },
] as const

export const publicPageDestinations: readonly NavigationDestination[] = [
  { title: '首页', href: '#top', detail: 'WENHAO 的个人空间' },
  { title: '文章', href: '#writing', detail: '设计、内容与技术实践的文章索引' },
  { title: '作品', href: '#work', detail: '项目与设计实践归档' },
  { title: 'AI 电商实验室', href: '#ai-commerce', detail: '产品分析、主图方向与详情分镜' },
  { title: '工具导航', href: '#tools', detail: '常用工具与工作流入口' },
  { title: '留言', href: '#guestbook', detail: '留下想法，交流近况' },
  { title: '音乐', href: '#music', detail: '音乐与声音可视化' },
  { title: '关于与联系', href: '#about', detail: `了解这个空间并联系我：${site.contacts.email}` },
] as const

export const articleSearchContent = articleSummaries
export const projectSearchContent = projectSummaries
export const toolSearchContent = toolCategories
