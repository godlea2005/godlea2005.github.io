import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToolCard } from '../src/components/tool-navigation/ToolCard'

const tool = {
  id: 'react-bits', name: 'React Bits', href: 'https://www.reactbits.dev/', host: 'reactbits.dev',
  description: '收录可配置的 React 动效、文本与背景组件。', note: '不应显示的长注记',
  tags: ['前端组件'], logoHost: 'reactbits.dev', categoryId: 'frontend-dev', featured: false,
} as const

describe('ToolCard', () => {
  it('renders only the compact visible hierarchy and a safe target-cursor link', () => {
    render(<ToolCard tool={tool} />)
    const link = screen.getByRole('link', { name: /React Bits/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('data-target-cursor')
    expect(link).toHaveAttribute('data-cursor-label', '打开工具')
    expect(link).toHaveTextContent('收录可配置的 React 动效、文本与背景组件。')
    expect(link).toHaveTextContent('reactbits.dev')
    expect(link).not.toHaveTextContent('不应显示的长注记')
    expect(link).not.toHaveTextContent('EXTERNAL LINK')
  })

  it('removes collapsed cards from keyboard tab order', () => {
    render(<ToolCard tool={tool} interactive={false} />)
    expect(screen.getByRole('link', { name: /React Bits/ })).toHaveAttribute('tabindex', '-1')
  })
})
