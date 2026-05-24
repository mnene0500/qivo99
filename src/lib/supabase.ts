import { createClient } from '@supabase/supabase-js';

/**
 * @fileOverview Standard Supabase Client.
 * Uses NEXT_PUBLIC variables for the browser and SERVICE_ROLE for server-side admin tasks.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key', 
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
);

/**
 * Admin Client (Server Only)
 * Uses the Service Role Key to bypass RLS for administrative operations.
 */
export const getSupabaseAdmin = () => {
  if (typeof window !== 'undefined') {
    throw new Error("Admin client cannot run in browser");
  }

  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!adminUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(adminUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

/**
 * Helper to convert Base64 string to a Blob for Supabase Storage uploads.
 */
export function base64ToBlob(base64: string): { blob: Blob, contentType: string } {
  const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Invalid image string format.");
  }

  const contentType = matches[1];
  const b64Data = matches[2];
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return { 
    blob: new Blob(byteArrays, { type: contentType }),
    contentType 
  };
}

/**
 * Profile Photo Upload (Uses standard client so it works for all users in browser)
 */
export async function uploadProfilePhoto(file: File | Blob, userId: string) {
  const timestamp = Date.now();
  const filePath = `${userId}/${timestamp}.jpg`;
  
  const { error } = await supabase.storage.from('photos').upload(filePath, file, { 
    cacheControl: '0', 
    upsert: true,
    contentType: 'image/jpeg'
  });
  
  if (error) throw error;
  
  const { data } = supabase.storage.from('photos').getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Gallery/Post Photo Upload
 */
export async function uploadPostPhoto(file: File | Blob, userId: string, bucket = 'photos') {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const filePath = `${userId}/gallery-${timestamp}-${uuid}.jpg`;
  
  const { error } = await supabase.storage.from(bucket).upload(filePath, file, { 
    cacheControl: '0', 
    upsert: true,
    contentType: 'image/jpeg'
  });
  
  if (error) throw error;
  
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
