import { beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const mocks = vi.hoisted(()=>({ rpc: vi.fn() }))
vi.mock('../src/lib/supabase',()=>({ supabaseConfigured: true, supabase: { rpc: mocks.rpc } }))
import { guestbookRepository } from '../src/guestbook/guestbookRepository'
beforeEach(()=>mocks.rpc.mockReset())
const row = { id:'m1', author:'A', website:'', content:'Hi', image_path:null,created_at:'2026-11-03T00:00:00Z',reply_to:null,status:'approved',client_browser:'Web',client_platform:'Web',is_owner:false,can_manage:false,avatar_url:'https://example.com/avatar.png' }
it('maps photo URLs by message rather than granting every manageable message the viewer avatar',async()=>{
  mocks.rpc.mockResolvedValue({data:[row],error:null})
  expect((await guestbookRepository.list())[0].avatarUrl).toBe(row.avatar_url)
})
it('remains compatible with the old database until the local migration is approved',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}}).mockResolvedValueOnce({data:[{...row,avatar_url:null}],error:null})
  expect((await guestbookRepository.list())[0].avatarUrl).toBeUndefined()
  expect(mocks.rpc).toHaveBeenNthCalledWith(2,'list_guestbook_messages')
})
it('does not treat permission errors as an absent migration',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}})
  await expect(guestbookRepository.list()).rejects.toEqual({code:'42501'})
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('exposes only the avatar for already-visible messages without changing the original RPC',()=>{
  const sql = readFileSync('supabase/migrations/202611030001_guestbook_account_avatars.sql','utf8')
  expect(sql).toContain('from public.list_guestbook_messages() visible')
  expect(sql).toContain('set search_path = \'\'')
  expect(sql).toContain('from public, anon')
  expect(sql).not.toContain('drop function')
})
