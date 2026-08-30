import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import {
  createProductionCommerceUploadHandler,
  type CommerceUploadServiceClient,
  type CommerceUploadUserClient,
} from '../_shared/commerce-upload-runtime.ts'

const runtime = globalThis as unknown as {
  Deno?: {
    env?: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Promise<Response>): void
  }
}

// Keep imports permission-free: environment access and privileged client construction happen
// only when the Edge entry point starts, so contract tests can import this module safely.
if (import.meta.main) {
  const handler = createProductionCommerceUploadHandler({
    getEnv: (name) => runtime.Deno?.env?.get(name),
    createClient: (url, key, options) => createClient(url, key, options) as unknown as
      CommerceUploadUserClient & CommerceUploadServiceClient,
  })
  runtime.Deno?.serve(handler)
}
