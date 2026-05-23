
import { NextRequest, NextResponse } from 'next/server';

/**
 * @fileOverview Hardened Supabase Proxy.
 * Handles Auth redirects and injects private keys on the server.
 */

export async function GET(req: NextRequest) { return handleProxy(req); }
export async function POST(req: NextRequest) { return handleProxy(req); }
export async function PUT(req: NextRequest) { return handleProxy(req); }
export async function PATCH(req: NextRequest) { return handleProxy(req); }
export async function DELETE(req: NextRequest) { return handleProxy(req); }

async function handleProxy(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ 
      error: "Supabase configuration missing on Vercel.",
      details: "Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in Vercel Settings."
    }, { status: 500 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/api/supabase', '');
  const searchParams = url.search;
  
  const targetUrl = `${supabaseUrl}${path}${searchParams}`;

  const headers = new Headers(req.headers);
  headers.set('apikey', supabaseAnonKey);
  
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader.includes('proxy-auth-active')) {
    headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
  }

  headers.delete('host');
  headers.delete('connection');

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: headers,
      redirect: 'manual', // We handle redirects manually to ensure client receives them
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = await req.clone().arrayBuffer();
    }

    const response = await fetch(targetUrl, fetchOptions);
    
    // Handle redirects (for OAuth/Google Login)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        return NextResponse.redirect(location, response.status);
      }
    }

    const resHeaders = new Headers(response.headers);
    resHeaders.delete('content-encoding'); 
    resHeaders.delete('transfer-encoding');
    
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders
    });
  } catch (error: any) {
    console.error("[Supabase Proxy Error]:", error.message);
    return NextResponse.json({ error: "Supabase unreachable via proxy." }, { status: 502 });
  }
}
