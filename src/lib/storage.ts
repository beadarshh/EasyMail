import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, storageEnabled } from "./env";

let client: SupabaseClient | undefined;

function supabase() {
  if (!client) {
    const e = env();
    client = createClient(e.SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function uploadAttachment(path: string, body: ArrayBuffer, contentType: string) {
  if (!storageEnabled()) return null;
  const { error } = await supabase()
    .storage.from(env().SUPABASE_BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export async function signedAttachmentUrl(path: string, filename: string) {
  const { data, error } = await supabase()
    .storage.from(env().SUPABASE_BUCKET)
    .createSignedUrl(path, 60, { download: filename });
  if (error) throw new Error(`Could not sign URL: ${error.message}`);
  return data.signedUrl;
}

export async function removeAttachments(paths: string[]) {
  if (!storageEnabled() || paths.length === 0) return;
  await supabase().storage.from(env().SUPABASE_BUCKET).remove(paths);
}
