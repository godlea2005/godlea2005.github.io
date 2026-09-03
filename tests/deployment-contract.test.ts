import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const sha256 = (path: string) => createHash('sha256')
  .update(readFileSync(resolve(process.cwd(), path)))
  .digest('hex')

describe('AI commerce deployment contract', () => {
  it('pins the local Edge validation toolchain and command', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(packageJson.scripts?.['check:edge']).toBe(
      'deno check supabase/functions/analyze-commerce/index.ts supabase/functions/commerce-upload/index.ts supabase/functions/cleanup-commerce-assets/index.ts',
    )
    expect(packageJson.devDependencies).toMatchObject({
      '@types/node': '24.13.3',
      deno: '2.9.6',
      supabase: '2.116.0',
    })
  })

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
    expect(workflow).toContain('Validate public build configuration')
    expect(workflow).toContain('::error::Missing or placeholder VITE_SUPABASE_URL')
    expect(workflow).toContain('::error::Missing or placeholder VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(workflow).toMatch(/-z "\$VITE_SUPABASE_URL"/)
    expect(workflow).toMatch(/-z "\$VITE_SUPABASE_PUBLISHABLE_KEY"/)
    expect(workflow.indexOf('Validate public build configuration')).toBeLessThan(workflow.indexOf('run: npm test'))
    expect(workflow.indexOf('run: npm ci')).toBeLessThan(workflow.indexOf('run: npm test'))
    expect(workflow.indexOf('run: npm test')).toBeLessThan(workflow.indexOf('run: npm run build'))
    expect(workflow.indexOf('run: npm run build')).toBeLessThan(workflow.indexOf('actions/upload-pages-artifact'))
    expect(workflow).toMatch(/deploy:[\s\S]*needs: build/)
    expect(workflow).not.toMatch(/OPENAI_API_KEY|DEEPSEEK_API_KEY|AI_PROVIDER|SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY|CLEANUP_SECRET/)
  })

  it('routes the production analysis function through an explicit server-side provider', () => {
    const entry = read('supabase/functions/analyze-commerce/index.ts')
    const provider = read('supabase/functions/_shared/ai-provider.ts')

    expect(entry).toContain("import { createAiProvider } from '../_shared/ai-provider.ts'")
    expect(entry).toContain('aiProvider: createAiProvider()')
    expect(entry).not.toContain('createOpenAiProvider')

    expect(provider).toContain("const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'")
    expect(provider).toContain("const DEEPSEEK_RESPONSES_URL = 'https://api.deepseek.com/responses'")
    expect(provider).toContain("const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp'")
    expect(provider).not.toMatch(/OPENAI_BASE_URL|DEEPSEEK_BASE_URL|AI_BASE_URL/)
  })

  it('documents the exact production surface and external gates', () => {
    const guide = read('docs/ai-commerce-operations.md')
    const migrations = [
      '202608210001_ai_commerce.sql',
      '202608290001_admin_entitlement_daily_limit.sql',
      '202608300001_commerce_cleanup_lease.sql',
      '202608300002_commerce_cleanup_claim.sql',
      '202608300003_commerce_cleanup_recovery.sql',
      '202608310001_commerce_upload_security.sql',
      '202609030001_commerce_project_validation.sql',
    ]
    for (const name of [
      ...migrations,
      'commerce-upload',
      'analyze-commerce',
      'cleanup-commerce-assets',
      'admin_set_entitlement',
      'admin_update_settings',
      'fail_commerce_generation',
      'create_commerce_project',
      'update_commerce_project',
      'set_commerce_project_locked',
      'admin_refund_commerce_generation',
      'SUPABASE_CLEANUP_URL',
      'SUPABASE_CLEANUP_SECRET',
    ]) expect(guide).toContain(name)
    expect(migrations.map((name) => guide.indexOf(name))).toEqual(
      [...migrations.map((name) => guide.indexOf(name))].sort((left, right) => left - right),
    )
    const releaseOrder = guide.match(/发布顺序不得调换：([^\n]+)/)?.[1] ?? ''
    const releaseSteps = [
      '迁移',
      'commerce-upload',
      'analyze-commerce',
      'cleanup-commerce-assets',
      'Supabase 服务端',
      'GitHub Variables/Secrets',
      'staging live gates',
      'Pages',
    ]
    const releaseIndices = releaseSteps.map((step) => releaseOrder.indexOf(step))
    expect(releaseIndices.every((index) => index >= 0)).toBe(true)
    expect(releaseIndices).toEqual(
      [...releaseIndices].sort((left, right) => left - right),
    )
    expect(guide).toMatch(/7 天/)
    expect(guide).toMatch(/800000000.*650000000/s)
    expect(guide).toMatch(/全站.*软上限/)
    expect(guide).toMatch(/超过 7 天.*locked.*仍可清理/)
    expect(guide).toMatch(/queued.*processing.*保护/s)
    expect(guide).not.toMatch(/每用户.*30 MB|locked.*不能删除|被引用资产受保护/)
    expect(guide).toMatch(/999/)
    expect(guide).toMatch(/跨用户 RLS|cross-user RLS/)
    expect(guide).toMatch(/匿名.*401/)
    expect(guide).toMatch(/幂等键.*只扣费一次/)
    expect(guide).toMatch(/模型失败.*只退款一次/)
    expect(guide).toMatch(/私有.*签名/)
    expect(guide).toMatch(/cleanup lease.*recovery/i)
    expect(guide).toMatch(/OAuth.*回跳/)
    expect(guide).toMatch(/Pages.*冒烟/)
    expect(guide).toMatch(/reserve[\s\S]*signed upload[\s\S]*finalize/i)
    expect(guide).toMatch(/delete_commerce_project[\s\S]*Storage[\s\S]*孤儿对象/i)
    expect(guide).toMatch(/authenticated[\s\S]*commerce_projects[\s\S]*INSERT[\s\S]*UPDATE[\s\S]*撤销/i)
    expect(guide).toMatch(/人工退款[\s\S]*generation_refund[\s\S]*幂等/i)
    expect(guide).toMatch(/OPENAI_TIMEOUT_MS[\s\S]*60 秒[\s\S]*5[\s\S]*90 秒/i)
    expect(guide).toMatch(/\*\/15 \* \* \* \*/)
    expect(guide).toContain('static_files = [ "./functions/commerce-upload/vendor/*" ]')
    expect(guide).toContain('LICENSE-APACHE-2.0.txt')
    expect(guide).toContain('@jsquash/jpeg@1.6.0')
    expect(guide).toContain('@jsquash/png@3.1.1')
    expect(guide).toContain('@jsquash/webp@1.5.0')
    expect(guide).toMatch(/最多 25 条/)
    expect(guide).toMatch(/不得回退[。\s\S]*浏览器直写/)
    expect(guide).toMatch(/孤儿对象[、和与及\s/]*放弃上传|放弃上传[、和与及\s/]*孤儿对象/)
    for (const gate of [
      '迁移语法/grants',
      '直传孤儿对象拒绝',
      '第七张',
      '跨用户 RLS/路径',
      '伪造 MIME/大小与 Blob MIME',
      '真实解码/static_files',
      'finalize CAS',
      'takeover/中断 finalize',
      '响应丢失 finalize',
      '原子终态恢复',
      '提供商超时/超时退款',
      'cleanup 分页/孤儿清理',
      '定时/安全错误',
      '项目输入 RPC/直写拒绝',
      '人工退款重复/并发',
    ]) expect(guide).toContain(gate)
    expect(guide).toMatch(/\*\*直传孤儿对象拒绝\*\*[\s\S]{0,250}不经 reserve[\s\S]{0,150}Storage 拒绝/)
    expect(guide).toMatch(/\*\*伪造 MIME\/大小与 Blob MIME\*\*[\s\S]{0,300}不一致[\s\S]{0,150}对象先被删除[\s\S]{0,100}failed/)
    expect(guide).toMatch(/\*\*原子终态恢复\*\*[\s\S]{0,300}同一事务[\s\S]{0,150}queued\/processing[\s\S]{0,150}reconciliation/)
    expect(guide).not.toMatch(/(?:原生|真实|live).{0,40}(?:Deno|PostgreSQL|Postgres|Storage).{0,40}(?:已通过|通过验证)/is)
  })

  it('pins the secure upload migration, function bundle, timeout, and cleanup schedule', () => {
    const migration = read('supabase/migrations/202608310001_commerce_upload_security.sql')
    expect(migration).toContain('revoke insert, update, delete on public.commerce_project_assets from authenticated;')
    expect(migration).toContain('grant execute on function public.reserve_commerce_asset(uuid, text, text, bigint) to authenticated;')
    expect(migration).toContain('grant execute on function public.takeover_abandoned_commerce_asset_upload(uuid, timestamptz, uuid) to service_role;')

    const config = read('supabase/config.toml')
    expect(config).toMatch(/\[functions\.commerce-upload\][\s\S]*verify_jwt = false[\s\S]*static_files = \[ "\.\/functions\/commerce-upload\/vendor\/\*" \]/)

    const decoder = read('supabase/functions/_shared/commerce-image-decoder.ts')
    const manifest = read('supabase/functions/commerce-upload/vendor/README.md')
    const wasmFiles = [
      ['mozjpeg_dec.wasm', '@jsquash/jpeg@1.6.0', 'a7c4b12169817e779ff4af137981393ae924944e167ad1bd95747c9199162d3e'],
      ['squoosh_png_bg.wasm', '@jsquash/png@3.1.1', '263d6e658808a74b72a1a99c5cc1d619237e70c150db6e41d5d84d3d117ab9be'],
      ['webp_dec.wasm', '@jsquash/webp@1.5.0', '30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344'],
    ] as const
    for (const [file, packageName, hash] of wasmFiles) {
      expect(decoder).toContain(packageName)
      expect(manifest).toContain(`\`${file}\``)
      expect(manifest).toContain(hash)
      expect(sha256(`supabase/functions/commerce-upload/vendor/${file}`)).toBe(hash)
    }
    expect(read('supabase/functions/commerce-upload/vendor/LICENSE-APACHE-2.0.txt')).toContain('Apache License')

    const provider = read('supabase/functions/_shared/ai-provider.ts')
    expect(provider).toMatch(/DEFAULT_TIMEOUT_MS = 60_000/)
    expect(provider).toMatch(/MIN_TIMEOUT_MS = 5_000/)
    expect(provider).toMatch(/MAX_TIMEOUT_MS = 90_000/)
    expect(provider).toMatch(/getEnv\('AI_TIMEOUT_MS'\)\?\.trim\(\)/)
    expect(provider).toMatch(/getEnv\('OPENAI_TIMEOUT_MS'\)\?\.trim\(\)/)
    expect(provider).toMatch(/!Number\.isFinite\(configured\) \|\| configured <= 0\) return DEFAULT_TIMEOUT_MS/)
    expect(provider).toMatch(/Math\.min\(MAX_TIMEOUT_MS, Math\.max\(MIN_TIMEOUT_MS, configured\)\)/)

    const cleanupWorkflow = read('.github/workflows/cleanup-commerce-assets.yml')
    expect(cleanupWorkflow).toContain("cron: '*/15 * * * *'")
    expect(cleanupWorkflow).toMatch(/workflow_dispatch:\s*$/m)
    expect(cleanupWorkflow).toMatch(/^permissions: \{\}\s*$/m)
    expect(cleanupWorkflow).toMatch(/timeout-minutes: 5/)
    expect(cleanupWorkflow).toMatch(/curl --fail-with-body --silent --show-error/)
    expect(cleanupWorkflow).toContain('SUPABASE_CLEANUP_URL: ${{ secrets.SUPABASE_CLEANUP_URL }}')
    expect(cleanupWorkflow).toContain('SUPABASE_CLEANUP_SECRET: ${{ secrets.SUPABASE_CLEANUP_SECRET }}')
    expect(cleanupWorkflow).not.toMatch(/SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY|OPENAI_API_KEY/)
  })
})
