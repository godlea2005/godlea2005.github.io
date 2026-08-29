import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('commerce cleanup deployment contracts', () => {
  it('keeps the workflow scheduled/manual, env-secret-only, quiet, bounded, and minimally privileged', () => {
    const workflow = read('.github/workflows/cleanup-commerce-assets.yml')
    expect(workflow).toContain("cron: '20 19 * * *'")
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('permissions: {}')
    expect(workflow).toMatch(/timeout-minutes:\s*5/)
    expect(workflow).toContain('curl --fail-with-body --silent --show-error --retry 2')
    expect(workflow).toContain('-H "x-cleanup-secret: $SUPABASE_CLEANUP_SECRET"')
    expect(workflow).toContain('-H "x-cleanup-trigger: $CLEANUP_TRIGGER_REASON"')
    expect(workflow).toContain('SUPABASE_CLEANUP_URL: ${{ secrets.SUPABASE_CLEANUP_URL }}')
    expect(workflow).toContain('SUPABASE_CLEANUP_SECRET: ${{ secrets.SUPABASE_CLEANUP_SECRET }}')
    expect(workflow).not.toMatch(/set\s+-x|--verbose|curl\s+-v/i)
    expect(workflow.match(/\$\{\{\s*secrets\./g)).toHaveLength(2)
  })

  it('keeps cleanup JWT verification disabled only at the function config boundary', () => {
    const config = read('supabase/config.toml')
    expect(config).toMatch(/\[functions\.cleanup-commerce-assets\]\s*verify_jwt\s*=\s*false/)
  })

  it('defines atomic claim release finalize and generation fences with least privilege', () => {
    const migration = read('supabase/migrations/202608300002_commerce_cleanup_claim.sql')
    for (const token of [
      "state in ('uploading','ready','processing','deleting','deleted','failed')",
      'claim_commerce_asset_for_cleanup',
      'release_commerce_asset_cleanup_claim',
      'finalize_commerce_asset_cleanup',
      'set_commerce_generation_assets_state',
      "generation.status in ('queued', 'processing')",
      "asset.state = 'deleting'",
      'for update',
      "set search_path = ''",
      'revoke all on function',
      'to service_role',
      "and state = 'uploading'",
      "and state <> 'deleting'",
    ]) expect(migration.toLowerCase()).toContain(token.toLowerCase())
    expect(migration).toMatch(/create or replace function public\.begin_commerce_generation[\s\S]*for update[\s\S]*state = 'deleting'/)
    expect(migration).toMatch(/claim_commerce_asset_for_cleanup[\s\S]*project\.locked[\s\S]*queued', 'processing'/)
    expect(migration).toMatch(/release_commerce_asset_cleanup_claim[\s\S]*set state = 'ready'[\s\S]*cleanup_run_id = p_run_id/)
    expect(migration).toMatch(/finalize_commerce_asset_cleanup[\s\S]*set state = 'deleted'[\s\S]*state = 'deleting'[\s\S]*cleanup_run_id = p_run_id/)
    expect(migration).not.toMatch(/grant execute[^;]+to authenticated[^;]+claim_commerce_asset_for_cleanup/i)
  })

  it('serializes queued-before-processing, ready-to-processing, and lock-vs-claim races', () => {
    const migration = read('supabase/migrations/202608300002_commerce_cleanup_claim.sql')
    const claim = migration.slice(migration.indexOf('create or replace function public.claim_commerce_asset_for_cleanup'))
    expect(claim).toMatch(/select project\.locked[\s\S]*for update[\s\S]*generation\.status in \('queued', 'processing'\)[\s\S]*set state = 'deleting'/)
    const begin = migration.slice(migration.indexOf('create or replace function public.begin_commerce_generation'))
    expect(begin).toMatch(/commerce_projects[\s\S]*for update[\s\S]*asset\.state = 'deleting'[\s\S]*insert into public\.commerce_generations/)
    const stateRpc = migration.slice(migration.indexOf('create or replace function public.set_commerce_generation_assets_state'))
    expect(stateRpc).toMatch(/commerce_projects[\s\S]*for update[\s\S]*generation_row\.status not in \('queued', 'processing'\)[\s\S]*asset\.state = 'ready'[\s\S]*set state = 'processing'/)
  })
})
