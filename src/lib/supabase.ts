import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://taxmenbtzsiotgcvptue.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRheG1lbmJ0enNpb3RnY3ZwdHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTUzOTMsImV4cCI6MjA5NDY5MTM5M30.KToHUbmwdKus6jDoP7ojmM2xILcbIae3G-9E6Wb4xTw';

/**
 * @fileOverview Central Supabase Client.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Helper to upload a base64 image to Supabase Storage.
 */
export async function uploadBase64Image(base64: string, bucket: string, path: string): Promise<string> {
  try {
    const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    if (!matches || matches.length !== 3) {
      if (base64.startsWith('http')) return base64;
      throw new Error("Invalid base64 format");
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: mimeType, upsert: true });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  } catch (err: any) {
    console.error("Upload failed:", err.message);
    throw err;
  }
}
