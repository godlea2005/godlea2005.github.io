import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('commerce cleanup deployment contracts', () => {
  it('removes authenticated asset and Storage write authority in the forward migration', () => {
    const migration = read('supabase/migrations/202608310001_commerce_upload_security.sql')
    expect(migration).toMatch(/revoke insert, update, delete on public\.commerce_project_assets from authenticated/i)
    expect(migration).toMatch(/drop policy if exists "commerce_assets_insert_own" on public\.commerce_project_assets/i)
    expect(migration).toMatch(/drop policy if exists "commerce_assets_update_own" on public\.commerce_project_assets/i)
    expect(migration).toMatch(/drop policy if exists "commerce_assets_delete_own" on public\.commerce_project_assets/i)
    expect(migration).toMatch(/drop policy if exists "commerce_storage_insert_own" on storage\.objects/i)
  })

  it('reserves bounded owned uploads with a server-generated path under the project lock', () => {
    const migration = read('supabase/migrations/202608310001_commerce_upload_security.sql')
    const reserve = migration.slice(migration.indexOf('create or replace function public.reserve_commerce_asset'))
    expect(reserve).toMatch(/auth\.uid\(\)[\s\S]*auth\.jwt\(\)[\s\S]*is_anonymous/)
    expect(reserve).toMatch(/commerce_projects[\s\S]*user_id = current_user_id[\s\S]*for update[\s\S]*state = 'deleting'/)
    expect(reserve).toMatch(/max_project_images[\s\S]*coalesce[\s\S]*'max_project_images'[\s\S]*6/)
    expect(reserve).toMatch(/count\(\*\)[\s\S]*state in \('uploading', 'validating', 'ready', 'processing', 'deleting'\)[\s\S]*active_asset_count >= max_project_images/)
    expect(reserve).toMatch(/p_size_bytes[\s\S]*between 1 and 8388608/)
    expect(reserve).toMatch(/image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/)
    expect(reserve).toMatch(/gen_random_uuid\(\)[\s\S]*current_user_id::text[\s\S]*p_project_id::text[\s\S]*normalized_extension/)
    expect(reserve).not.toMatch(/p_storage_path|p_path/)
    expect(migration).toContain('grant execute on function public.reserve_commerce_asset(uuid, text, text, bigint) to authenticated;')
  })

  it('keeps upload finalization and cleanup discovery service-only and fail-closed', () => {
    const migration = read('supabase/migrations/202608310001_commerce_upload_security.sql')
    expect(migration).toMatch(/add column if not exists validation_attempt_id uuid/)
    expect(migration).toMatch(/add column if not exists validation_started_at timestamptz/)
    expect(migration).toMatch(/state in \('uploading','validating','ready','processing','deleting','deleted','failed'\)/)
    expect(migration).toMatch(/commerce_project_assets_validation_claim_check[\s\S]*state = 'validating'[\s\S]*validation_attempt_id is not null[\s\S]*validation_started_at is not null/)

    const claim = migration.slice(
      migration.indexOf('create or replace function public.claim_commerce_asset_upload_validation'),
      migration.indexOf('create or replace function public.release_commerce_asset_upload_validation'),
    )
    expect(claim).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(claim).toMatch(/id = p_asset_id[\s\S]*user_id = p_user_id[\s\S]*for update/)
    expect(claim).toMatch(/state <> 'uploading'[\s\S]*return false/)
    expect(claim).toMatch(/set state = 'validating'[\s\S]*validation_attempt_id = p_attempt_id[\s\S]*validation_started_at = pg_catalog\.clock_timestamp\(\)/)

    const release = migration.slice(
      migration.indexOf('create or replace function public.release_commerce_asset_upload_validation'),
      migration.indexOf('create or replace function public.finalize_commerce_asset_upload'),
    )
    expect(release).toMatch(/set state = 'uploading'[\s\S]*state = 'validating'[\s\S]*validation_attempt_id = p_attempt_id/)

    const finalize = migration.slice(
      migration.indexOf('create or replace function public.finalize_commerce_asset_upload'),
      migration.indexOf('create or replace function public.fail_commerce_asset_upload'),
    )
    expect(finalize).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(finalize).toMatch(/id = p_asset_id[\s\S]*user_id = p_user_id[\s\S]*for update/)
    expect(finalize).toMatch(/state = 'ready'[\s\S]*mime_type[\s\S]*size_bytes[\s\S]*return query/)
    expect(finalize).toMatch(/state <> 'validating'[\s\S]*raise exception/)
    expect(finalize).toMatch(/validation_attempt_id is distinct from p_attempt_id[\s\S]*raise exception/)
    expect(finalize).toMatch(/p_actual_mime_type is distinct from asset_row\.mime_type[\s\S]*p_actual_size_bytes is distinct from asset_row\.size_bytes/)

    const failUpload = migration.slice(
      migration.indexOf('create or replace function public.fail_commerce_asset_upload'),
      migration.indexOf('create or replace function public.complete_commerce_generation'),
    )
    expect(failUpload).toMatch(/state <> 'validating'[\s\S]*raise exception/)
    expect(failUpload).toMatch(/current_attempt_id is distinct from p_attempt_id[\s\S]*raise exception/)
    expect(failUpload).toMatch(/set state = 'failed'[\s\S]*validation_attempt_id = null[\s\S]*validation_started_at = null/)

    const abandoned = migration.slice(
      migration.indexOf('create or replace function public.list_abandoned_commerce_uploads'),
      migration.indexOf('create or replace function public.list_orphan_commerce_storage_objects'),
    )
    expect(abandoned).toMatch(/state in \('uploading', 'validating'\)[\s\S]*coalesce\(asset\.validation_started_at, asset\.created_at\) < p_cutoff[\s\S]*order by asset\.created_at, asset\.id/)

    const takeover = migration.slice(
      migration.indexOf('create or replace function public.takeover_abandoned_commerce_asset_upload'),
      migration.indexOf('create or replace function public.list_orphan_commerce_storage_objects'),
    )
    expect(takeover).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(takeover).toMatch(/where asset\.id = p_asset_id[\s\S]*for update/)
    expect(takeover).toMatch(/state = 'uploading'[\s\S]*created_at < p_cutoff[\s\S]*state = 'validating'[\s\S]*validation_started_at < p_cutoff/)
    expect(takeover).toMatch(/set state = 'validating'[\s\S]*validation_attempt_id = p_attempt_id[\s\S]*validation_started_at = pg_catalog\.clock_timestamp\(\)/)
    expect(takeover).toMatch(/previous_state[\s\S]*previous_attempt_id[\s\S]*previous_validation_started_at[\s\S]*validation_attempt_id[\s\S]*validation_started_at[\s\S]*created_at/)

    const orphan = migration.slice(migration.indexOf('create or replace function public.list_orphan_commerce_storage_objects'))
    expect(orphan).toMatch(/storage\.objects[\s\S]*left join public\.commerce_project_assets[\s\S]*asset\.storage_path = object\.name/)
    expect(orphan).toMatch(/p_limit not between 1 and 500[\s\S]*bucket_id = 'commerce-assets'[\s\S]*object\.name > p_after_name[\s\S]*order by object\.name/)
    expect(migration).toContain('grant execute on function public.claim_commerce_asset_upload_validation(uuid, uuid, uuid) to service_role;')
    expect(migration).toContain('grant execute on function public.release_commerce_asset_upload_validation(uuid, uuid, uuid) to service_role;')
    expect(migration).toContain('grant execute on function public.finalize_commerce_asset_upload(uuid, uuid, uuid, text, bigint) to service_role;')
    expect(migration).toContain('grant execute on function public.fail_commerce_asset_upload(uuid, uuid, uuid) to service_role;')
    expect(migration).toContain('revoke all on function public.claim_commerce_asset_upload_validation(uuid, uuid, uuid)')
    expect(migration).toContain('revoke all on function public.release_commerce_asset_upload_validation(uuid, uuid, uuid)')
    expect(migration).toContain('revoke all on function public.finalize_commerce_asset_upload(uuid, uuid, uuid, text, bigint)')
    expect(migration).toContain('revoke all on function public.fail_commerce_asset_upload(uuid, uuid, uuid)')
    expect(migration).toContain('revoke all on function public.takeover_abandoned_commerce_asset_upload(uuid, timestamptz, uuid)')
    expect(migration).toContain('grant execute on function public.takeover_abandoned_commerce_asset_upload(uuid, timestamptz, uuid) to service_role;')
    expect(migration).not.toMatch(/grant execute on function public\.(?:finalize|fail|reconcile|list_)commerce_[^;]+to authenticated/i)
    expect(migration).not.toMatch(/grant execute on function public\.(?:claim|release)_commerce_asset_upload_validation[^;]+to authenticated/i)
  })

  it('qualifies RETURNS TABLE output names in SQL predicates, including finalization updates', () => {
    const migration = read('supabase/migrations/202608310001_commerce_upload_security.sql')
    const finalize = migration.slice(
      migration.indexOf('create or replace function public.finalize_commerce_asset_upload'),
      migration.indexOf('create or replace function public.fail_commerce_asset_upload'),
    )
    expect(finalize).toMatch(/update public\.commerce_project_assets as asset\s+set state = 'ready',[\s\S]*where asset\.id = p_asset_id\s+and asset\.user_id = p_user_id\s+and asset\.state = 'validating'\s+and asset\.validation_attempt_id = p_attempt_id/)

    const returnsTableFunctions = [
      'reserve_commerce_asset',
      'finalize_commerce_asset_upload',
      'list_abandoned_commerce_uploads',
      'list_orphan_commerce_storage_objects',
    ]
    for (const [index, functionName] of returnsTableFunctions.entries()) {
      const start = migration.indexOf(`create or replace function public.${functionName}`)
      const nextName = returnsTableFunctions[index + 1]
      const next = nextName
        ? migration.indexOf(`create or replace function public.${nextName}`, start + 1)
        : migration.indexOf('revoke all on function', start + 1)
      const functionSql = migration.slice(start, next)
      const outputDeclaration = functionSql.match(/returns table \(([\s\S]*?)\)\s*language plpgsql/i)?.[1]
      expect(outputDeclaration, `${functionName} RETURNS TABLE declaration`).toBeDefined()
      const outputNames = [...outputDeclaration!.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+[a-z]/gim)]
        .map((match) => match[1])
      const body = functionSql.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1]
      expect(body, `${functionName} body`).toBeDefined()
      for (const outputName of outputNames) {
        const unqualifiedSqlReference = new RegExp(
          `\\b(?:select|where|and|or|on|order\\s+by|group\\s+by)\\s+${outputName}\\b`,
          'i',
        )
        expect(body, `${functionName} must qualify OUT variable ${outputName} in SQL`).not.toMatch(unqualifiedSqlReference)
      }
    }
  })

  it('atomically restores processing assets on terminal writes and historical reconciliation', () => {
    const migration = read('supabase/migrations/202608310001_commerce_upload_security.sql')
    const complete = migration.slice(
      migration.indexOf('create or replace function public.complete_commerce_generation'),
      migration.indexOf('create or replace function public.fail_commerce_generation'),
    )
    expect(complete).toMatch(/commerce_generations[\s\S]*for update[\s\S]*status = 'completed'[\s\S]*commerce_project_assets[\s\S]*state = 'ready'/)
    expect(complete).toMatch(/not exists \([\s\S]*status in \('queued', 'processing'\)[\s\S]*state = 'processing'/)

    const fail = migration.slice(
      migration.indexOf('create or replace function public.fail_commerce_generation'),
      migration.indexOf('create or replace function public.reconcile_terminal_commerce_assets'),
    )
    expect(fail).toMatch(/commerce_generations[\s\S]*for update[\s\S]*status = 'failed'[\s\S]*generation_refund[\s\S]*commerce_project_assets[\s\S]*state = 'ready'/)
    expect(fail).toMatch(/generation_row\.credit_charged and generation_row\.refunded_at is null/)

    const reconcile = migration.slice(
      migration.indexOf('create or replace function public.reconcile_terminal_commerce_assets'),
      migration.indexOf('create or replace function public.list_abandoned_commerce_uploads'),
    )
    expect(reconcile).toMatch(/auth\.role\(\) is distinct from 'service_role'[\s\S]*commerce_projects[\s\S]*for update[\s\S]*state = 'processing'/)
    expect(reconcile).toMatch(/not exists \([\s\S]*status in \('queued', 'processing'\)[\s\S]*set state = 'ready'/)
  })

  it('keeps the workflow scheduled/manual, env-secret-only, quiet, bounded, and minimally privileged', () => {
    const workflow = read('.github/workflows/cleanup-commerce-assets.yml')
    expect(workflow).toContain("cron: '*/15 * * * *'")
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
