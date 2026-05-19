import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Helper to upload a base64 image to Supabase Storage.
 * Supports image/jpeg, image/png, etc.
 * @param base64 The base64 string of the image.
 * @param bucket The name of the Supabase bucket.
 * @param path The destination path in the bucket (e.g., 'uid/profile_123.jpg').
 * @returns The public URL of the uploaded image.
 */
export async function uploadBase64Image(base64: string, bucket: string, path: string): Promise<string> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase configuration missing in Environment Variables. Returning base64.");
    return base64;
  }

  try {
    // 1. Extract MIME type and pure base64 data
    const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    
    if (!matches || matches.length !== 3) {
      if (base64.startsWith('http')) return base64;
      throw new Error("Invalid base64 format");
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Ensure path has the correct extension based on MIME type
    let finalPath = path;
    if (!path.includes('.')) {
      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      finalPath = `${path}.${ext}`;
    }

    // 2. Convert to binary Blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // 3. Upload to Supabase
    const { error } = await supabase.storage
      .from(bucket)
      .upload(finalPath, blob, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error("[Supabase Storage Error]:", error.message);
      throw error;
    }

    // 4. Retrieve and return the public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(finalPath);

    return publicUrl;
  } catch (err: any) {
    console.error("Upload process failed:", err.message);
    throw err;
  }
}
