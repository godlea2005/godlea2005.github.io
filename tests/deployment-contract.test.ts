import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('AI commerce deployment contract', () => {
  it('keeps the frontend environment example public and placeholder-only', () => {
    expect(read('.env.example').trim().split(/\r?\n/)).toEqual([
      'VITE_SUPABASE_URL=https://your-project-ref.supabase.co',
      'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key',
    ])
  })

  it('uses repository variables and verifies before uploading Pages', () => {
    const workflow = read('.github/workflows/deploy-pages.yml')
    expect(workflow).toContain('${{ vars.VITE_SUPABASE_URL }}')
    expect(workflow).toContain('${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}')
    expect(workflow).not.toMatch(/ujwwwqlpwdplulzslgpi|sb_publishable_YtQn/)
    expect(workflow.indexOf('run: npm ci')).toBeLessThan(workflow.indexOf('run: npm test'))
    expect(workflow.indexOf('run: npm test')).toBeLessThan(workflow.indexOf('run: npm run build'))
    expect(workflow.indexOf('run: npm run build')).toBeLessThan(workflow.indexOf('actions/upload-pages-artifact'))
    expect(workflow).toMatch(/deploy:[\s\S]*needs: build/)
    expect(workflow).not.toMatch(/OPENAI_API_KEY|SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY|CLEANUP_SECRET/)
  })

  it('documents the exact production surface and external gates', () => {
    const guide = read('docs/ai-commerce-operations.md')
    for (const name of [
      '202608210001_ai_commerce.sql',
      '202608290001_admin_entitlement_daily_limit.sql',
      '202608300001_commerce_cleanup_lease.sql',
      '202608300002_commerce_cleanup_claim.sql',
      '202608300003_commerce_cleanup_recovery.sql',
      'analyze-commerce',
      'cleanup-commerce-assets',
      'admin_set_entitlement',
      'admin_update_settings',
      'fail_commerce_generation',
      'SUPABASE_CLEANUP_URL',
      'SUPABASE_CLEANUP_SECRET',
    ]) expect(guide).toContain(name)
    expect(guide).toMatch(/7 天/)
    expect(guide).toMatch(/30 MB/)
    expect(guide).toMatch(/999/)
    expect(guide).toMatch(/跨用户 RLS|cross-user RLS/)
    expect(guide).toMatch(/匿名.*401/)
    expect(guide).toMatch(/幂等键.*只扣费一次/)
    expect(guide).toMatch(/模型失败.*只退款一次/)
    expect(guide).toMatch(/私有.*签名/)
    expect(guide).toMatch(/cleanup lease.*recovery/i)
    expect(guide).toMatch(/OAuth.*回跳/)
    expect(guide).toMatch(/Pages.*冒烟/)
  })
})
