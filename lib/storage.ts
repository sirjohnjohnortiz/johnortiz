import { createClient } from "@/lib/supabase/client";

/** Uploads a file to a private bucket and returns the storage path (not a public URL). */
export async function uploadFile(bucket: string, file: File, prefix = ""): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop();
  const path = `${prefix}${prefix ? "/" : ""}${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

/** Generates a temporary signed URL to view/download a private file. */
export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
