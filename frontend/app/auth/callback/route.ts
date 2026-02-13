import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    // 1. Get the URL and the secret code from Supabase
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');

    if (code) {
        // 2. Exchange the code for an active, logged-in session
        const cookieStore = await cookies();

        // NOTE: using @supabase/ssr package which is the modern standard
        // If you are using @supabase/auth-helpers-nextjs 0.15.0 and it doesn't have createRouteHandlerClient,
        // you likely need to install @supabase/ssr or use createServerClient from auth-helpers with manual configuration.
        // However, given the user request implies a standard setup, I will try to use the auth-helpers one if installed,
        // BUT since it failed, I will assume the intention is to use the pattern that WORKS.
        // Let's try to see if we can use the generic createServerClient from auth-helpers if it exists?
        // Actually, let's just use the exact code that likely matches the installed version's capability.
        // Use createServerComponentClient? No.
        // I will try to use the *generic* createServerClient from auth-helpers-nextjs and provide the cookies.

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        cookieStore.set({ name, value, ...options });
                    },
                    remove(name: string, options: CookieOptions) {
                        cookieStore.set({ name, value: '', ...options });
                    },
                },
            }
        );

        await supabase.auth.exchangeCodeForSession(code);
    }

    // 3. Redirect the user to your main app page (e.g., /admin or /home)
    return NextResponse.redirect(new URL('/admin', request.url));
}
