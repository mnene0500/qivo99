
import { createClient } from '@supabase/supabase-js';

/**
 * @fileOverview Central Supabase Client for the browser and server.
 * Configured to use public environment variables.
 * Critical secrets are handled via Edge Function invocation.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (typeof window !== 'undefined') {
    console.warn("⚠️ Supabase credentials missing! The app will not function correctly until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.");
  }
}

// Browser & Server Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Helper to upload a base64 image to Supabase Storage.
 * Ensures the bucket name is correct and handles base64 stripping robustly.
 */
export async function uploadBase64Image(base64: string, bucket: string, path: string): Promise<string> {
  try {
    // 1. Validate if it's already a URL
    if (base64.startsWith('http')) return base64;

    // 2. Extract mime type and actual base64 data
    const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    if (!matches || matches.length !== 3) {
      console.error("[Storage] Regex mismatch on base64 string.");
      throw new Error("Invalid image format. Please select another photo.");
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // 3. Convert to Blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // 4. Upload to Supabase Storage
    console.log(`[Storage] Uploading to ${bucket}/${path} (${blob.size} bytes)`);
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { 
        contentType: mimeType, 
        upsert: true,
        cacheControl: '3600'
      });

    if (error) {
      console.error("[Storage Error] API returned error:", error.message);
      throw error;
    }

    // 5. Retrieve Public URL
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  } catch (err: any) {
    console.error("[Storage Crash] Upload process failed:", err.message);
    throw new Error(`Upload failed: ${err.message}`);
  }
}
