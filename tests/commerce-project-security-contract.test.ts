import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/202609030001_commerce_project_validation.sql'
const readMigration = () => readFileSync(resolve(process.cwd(), migrationPath), 'utf8')

describe('commerce project validation migration contract', () => {
  it('revokes direct authenticated project writes and exposes narrow owner RPCs', () => {
    const migration = readMigration()
    expect(migration).toMatch(/revoke insert, update, delete on public\.commerce_projects from authenticated/i)
    expect(migration).toMatch(/drop policy if exists "commerce_projects_insert_own"/i)
    expect(migration).toMatch(/drop policy if exists "commerce_projects_update_own"/i)
    expect(migration).toContain('grant execute on function public.create_commerce_project(text, text, text, jsonb) to authenticated;')
    expect(migration).toContain('grant execute on function public.update_commerce_project(uuid, text, text, text, jsonb) to authenticated;')
    expect(migration).toContain('grant execute on function public.set_commerce_project_locked(uuid, boolean) to authenticated;')
  })

  it('rejects unknown, nested, non-string, oversized, and excessive total input through one validator', () => {
    const migration = readMigration()
    const validator = migration.slice(
      migration.indexOf('create or replace function public.validate_commerce_project_input'),
      migration.indexOf('create or replace function public.create_commerce_project'),
    )
    for (const key of [
      'category', 'specifications', 'priceRange', 'sellingPoints', 'audience', 'brandTone',
      'competitorLinks', 'prohibitedWords', 'desiredStyle', 'notes',
    ]) expect(validator).toContain(`'${key}'`)
    expect(validator).toMatch(/jsonb_object_keys[\s\S]*unknown project input field/i)
    expect(validator).toMatch(/jsonb_each[\s\S]*jsonb_typeof\([^)]*value[^)]*\)\s*<>\s*'string'/i)
    expect(validator).toMatch(/char_length[\s\S]*>\s*2000/)
    expect(validator).toMatch(/pg_column_size\([^)]+\)[\s\S]*>\s*32768/)
    expect(validator).toMatch(/jsonb_typeof\([^)]+\)\s*<>\s*'object'/)
  })

  it('validates name, platform, mode and owner identity in create and update RPCs', () => {
    const migration = readMigration()
    expect(migration).toMatch(/create_commerce_project[\s\S]*auth\.uid\(\)[\s\S]*is_anonymous[\s\S]*char_length\(pg_catalog\.btrim\(p_name\)\)[\s\S]*between 1 and 80[\s\S]*p_platform not in \('ozon', 'wildberries', 'douyin', 'taobao-tmall'\)[\s\S]*p_mode not in \('quick', 'professional'\)/)
    expect(migration).toMatch(/update_commerce_project[\s\S]*where project\.id = p_project_id[\s\S]*project\.user_id = current_user_id[\s\S]*for update/)
  })

  it('implements an admin-only generation refund with row locks and explicit idempotent results', () => {
    const migration = readMigration()
    const refund = migration.slice(migration.indexOf('create or replace function public.admin_refund_commerce_generation'))
    expect(refund).toMatch(/site_is_admin\(\)[\s\S]*reason must be between 1 and 500 characters/)
    expect(refund).toMatch(/commerce_generations[\s\S]*for update[\s\S]*credit_charged[\s\S]*refunded_at/)
    expect(refund).toMatch(/user_entitlements[\s\S]*for update[\s\S]*set credits = credits \+ 1/)
    expect(refund.indexOf('from public.commerce_generations')).toBeLessThan(refund.indexOf('from public.user_entitlements'))
    expect(refund).toMatch(/if generation_row\.refunded_at is not null then[\s\S]*'status', 'already_refunded'[\s\S]*return pg_catalog\.jsonb_build_object\([\s\S]*'status', 'refunded'/)
    expect(refund).toMatch(/where generation\.id = generation_row\.id[\s\S]*generation\.refunded_at is null[\s\S]*if not found then[\s\S]*40001/)
    expect(refund).toMatch(/insert into public\.credit_ledger[\s\S]*'generation_refund'/)
    expect(refund).toMatch(/insert into public\.admin_audit_log[\s\S]*p_reason/)
    expect(refund).toMatch(/'already_refunded'[\s\S]*'refunded'/)
    expect(migration).toMatch(/credit_ledger_generation_reason_idx[\s\S]*generation_id, reason/)
    expect(migration).toContain('grant execute on function public.admin_refund_commerce_generation(uuid, text) to authenticated;')
  })
})
