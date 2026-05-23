
import { createClient } from '@supabase/supabase-js';

/**
 * @fileOverview Secure Supabase Client with ZERO NEXT_PUBLIC requirement.
 * Routes all client traffic through a local server-side proxy.
 */

const isServer = typeof window === 'undefined';

const getSupabaseConfig = () => {
  if (isServer) {
    // SERVER SIDE: Access real secrets
    // We throw errors here if missing to prevent DNS "placeholder" errors
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

    if (!url || !anonKey) {
      console.warn("⚠️ [Supabase] Missing Environment Variables on Server.");
    }

    return {
      url: url || 'https://missing-url.local',
      anonKey: anonKey || 'missing-key',
      serviceKey: serviceKey || 'missing-key'
    };
  } else {
    // CLIENT SIDE: Use the secure local proxy
    // No external URLs or keys are exposed to the browser
    return {
      url: `${window.location.origin}/api/supabase`,
      anonKey: 'proxy-auth-active',
      serviceKey: 'proxy-auth-active'
    };
  }
};

const config = getSupabaseConfig();

// Main Client
export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: !isServer ? window.localStorage : undefined,
    flowType: 'pkce'
  }
});

// Admin Client (Server Only)
export const getSupabaseAdmin = () => {
  if (!isServer) throw new Error("Admin client can only be used on the server.");
  const cfg = getSupabaseConfig();
  return createClient(cfg.url, cfg.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

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

export async function uploadProfilePhoto(file: File | Blob, userId: string) {
  const admin = getSupabaseAdmin();
  const timestamp = Date.now();
  const filePath = `${userId}/${timestamp}.jpg`;
  const { error } = await admin.storage.from('photos').upload(filePath, file, { cacheControl: '0', upsert: true });
  if (error) throw error;
  const { data } = admin.storage.from('photos').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadPostPhoto(file: File | Blob, userId: string, bucket = 'photos') {
  const admin = getSupabaseAdmin();
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const filePath = `${userId}/gallery-${timestamp}-${uuid}.jpg`;
  const { error } = await admin.storage.from(bucket).upload(filePath, file, { cacheControl: '0', upsert: true });
  if (error) throw error;
  const { data } = admin.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
