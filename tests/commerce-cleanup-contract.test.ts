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

  it('adopts interrupted claims and fences every destructive transition to the active lease', () => {
    const migration = read('supabase/migrations/202608300003_commerce_cleanup_recovery.sql')
    expect(migration).toContain('cleanup_previous_state')
    expect(migration).toMatch(/begin_commerce_cleanup[\s\S]*pg_advisory_xact_lock\(20260830, 9\)[\s\S]*lease_until > transaction_now[\s\S]*set cleanup_run_id = next_run_id[\s\S]*where state = 'deleting'/)
    expect(migration).toMatch(/list_commerce_cleanup_claims[\s\S]*lease_until > pg_catalog\.clock_timestamp\(\)[\s\S]*asset\.state = 'deleting'[\s\S]*asset\.cleanup_run_id = p_run_id/)

    const claim = migration.slice(migration.indexOf('create or replace function public.claim_commerce_asset_for_cleanup'))
    expect(claim).toMatch(/pg_advisory_xact_lock\(20260830, 9\)[\s\S]*commerce_cleanup_leases[\s\S]*for update[\s\S]*commerce_projects[\s\S]*for update[\s\S]*commerce_project_assets[\s\S]*for update[\s\S]*lease_until > pg_catalog\.clock_timestamp\(\)/)
    expect(claim).toMatch(/p_reason = 'expired'[\s\S]*asset_row\.state not in \('ready', 'failed'\)/)
    expect(claim).toMatch(/p_reason = 'soft_limit'[\s\S]*asset_row\.state <> 'ready'[\s\S]*project_locked/)
    expect(claim).toMatch(/cleanup_previous_state = asset_row\.state/)

    const release = migration.slice(migration.indexOf('create or replace function public.release_commerce_asset_cleanup_claim'))
    expect(release).toMatch(/p_lease_token uuid[\s\S]*lease_until > pg_catalog\.clock_timestamp\(\)[\s\S]*set state = previous_state/)
    const finalize = migration.slice(migration.indexOf('create or replace function public.finalize_commerce_asset_cleanup'))
    expect(finalize).toMatch(/p_lease_token uuid[\s\S]*lease_until > pg_catalog\.clock_timestamp\(\)[\s\S]*set state = 'deleted'/)

    const finish = migration.slice(migration.indexOf('create or replace function public.finish_commerce_cleanup'))
    expect(finish).toMatch(/outstanding_claims > 0[\s\S]*final_status := 'partial'[\s\S]*cleanup_claims_require_replay[\s\S]*lease_until = pg_catalog\.clock_timestamp\(\) - interval '1 second'/)
    expect(migration).toMatch(/drop function public\.release_commerce_asset_cleanup_claim\(uuid, uuid\)/)
    expect(migration).toMatch(/drop function public\.finalize_commerce_asset_cleanup\(uuid, uuid, timestamptz\)/)
    expect(migration).not.toMatch(/grant execute on function public\.(?:claim|release|finalize|list)_commerce_[^;]+to authenticated/i)
  })
})
