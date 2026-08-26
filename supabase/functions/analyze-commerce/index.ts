import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { createOpenAiProvider } from '../_shared/ai-provider.ts'
import {
  createProductionAnalyzeHandler,
  type SupabaseLike,
  type UserClient,
} from '../_shared/commerce-runtime.ts'

const runtime = globalThis as unknown as {
  Deno?: {
    env?: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Promise<Response>): void
  }
  EdgeRuntime?: { waitUntil(task: Promise<void>): void }
}

// Importing this module performs no environment reads. Secrets are resolved only when the
// actual Edge Function entry point starts, so permission-free `deno test` can import helpers.
if (import.meta.main) {
  const handler = createProductionAnalyzeHandler({
    getEnv: (name) => runtime.Deno?.env?.get(name),
    createClient: (url, key, options) =>
      createClient(url, key, options) as unknown as SupabaseLike & UserClient,
    aiProvider: createOpenAiProvider(),
    waitUntil: (task) => {
      if (!runtime.EdgeRuntime?.waitUntil) throw new Error('Background tasks unavailable')
      runtime.EdgeRuntime.waitUntil(task)
    },
  })
  runtime.Deno?.serve(handler)
}
