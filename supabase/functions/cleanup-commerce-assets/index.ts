import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import {
  createProductionCleanupHandler,
  type CleanupSupabaseClient,
} from '../_shared/cleanup-runtime.ts'

const runtime = globalThis as unknown as {
  Deno?: {
    env?: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Promise<Response>): void
  }
}

// Keep imports permission-free: runtime secrets are resolved only when Supabase starts
// the production entrypoint, while tests import the pure cleanup module directly.
if (import.meta.main) {
  const handler = createProductionCleanupHandler({
    getEnv: (name) => runtime.Deno?.env?.get(name),
    createClient: (url, key, options) =>
      createClient(url, key, options) as unknown as CleanupSupabaseClient,
  })
  runtime.Deno?.serve(handler)
}
