import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRandomDefaultAvatarUrl } from '@/lib/avatars';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
          remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
        },
      }
    );

    // Only signup confirmations reach here now
    await supabase.auth.exchangeCodeForSession(code);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const meta = user.user_metadata || {};
      const avatarUrl = meta.avatar_url || getRandomDefaultAvatarUrl();
      await supabase.from('profiles').upsert({
        id: user.id,
        first_name: meta.first_name || null,
        other_names: meta.other_names || null,
        avatar_url: avatarUrl,
        university: meta.university || null,
        level: meta.level || null,
        has_seen_welcome: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }
  }

  return NextResponse.redirect(new URL('/main?welcome=true', request.url));
}
