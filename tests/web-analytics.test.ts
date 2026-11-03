import { afterEach, expect, it } from 'vitest'
import { installWebAnalytics, shouldLoadWebAnalytics } from '../src/lib/webAnalytics'

afterEach(()=>document.querySelectorAll('#cloudflare-web-analytics').forEach(node=>node.remove()))

it('only permits the exact HTTPS production domain',()=>{
  expect(shouldLoadWebAnalytics(true,new URL('https://geniusli.cn/#tools'))).toBe(true)
  for(const url of ['http://geniusli.cn/','http://localhost:5174/','http://127.0.0.1:5174/','https://www.geniusli.cn/','https://geniusli.cn.attacker.test/']) expect(shouldLoadWebAnalytics(true,new URL(url))).toBe(false)
  expect(shouldLoadWebAnalytics(false,new URL('https://geniusli.cn/'))).toBe(false)
})
it('excludes authentication callback query strings and token fragments',()=>{
  for(const suffix of ['?auth=site','?code=private','?state=private','?access_token=private','?refresh_token=private','?id_token=private','?token=private','?sb_flow_id=private','?CODE=private','#access_token=private&refresh_token=private','#error=private','#/callback?code=private','#tools?access_token=private']) expect(shouldLoadWebAnalytics(true,new URL(`https://geniusli.cn/${suffix}`))).toBe(false)
})
it('inserts exactly the approved module once, with only the public configuration',()=>{
  const options = { production:true, url:new URL('https://geniusli.cn/') }
  const script = installWebAnalytics(options)!
  expect(script.src).toBe('https://static.cloudflareinsights.com/beacon.min.js')
  expect(script.type).toBe('module')
  expect(JSON.parse(script.dataset.cfBeacon!)).toEqual({token:'d607fc712ff24374901fa73b3d68c0ad'})
  expect(installWebAnalytics(options)).toBe(script)
  expect(document.querySelectorAll('#cloudflare-web-analytics')).toHaveLength(1)
  expect(script.getAttributeNames().sort()).toEqual(['data-cf-beacon','id','src','type'])
})
it('adds nothing for local development or callback sessions',()=>{
  expect(installWebAnalytics({production:false,url:new URL('https://geniusli.cn/')})).toBeNull()
  expect(installWebAnalytics({production:true,url:new URL('http://127.0.0.1:5174/')})).toBeNull()
  expect(installWebAnalytics({production:true,url:new URL('https://geniusli.cn/?code=private')})).toBeNull()
  expect(document.querySelector('script[data-cf-beacon]')).toBeNull()
})
