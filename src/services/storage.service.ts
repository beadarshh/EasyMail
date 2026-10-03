import "server-only";
import { env, storageEnabled } from "@/lib/env";
import { supabase } from "./supabase";

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
