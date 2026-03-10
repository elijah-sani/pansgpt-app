import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Only server-guard admin routes.
// All other auth protection is handled client-side by ProfileGuard
// and (app)/layout.tsx — which correctly read from localStorage.
// The previous middleware was checking ALL routes server-side via cookies,
// but the app stores sessions in localStorage (not cookies), so the
// middleware always saw no session and redirected everything to /login.
function isAdminRoute(pathname: string): boolean {
    return pathname.startsWith('/admin/') || pathname === '/admin';
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only intercept admin routes
    if (!isAdminRoute(pathname)) {
        return NextResponse.next();
    }

    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirectedFrom', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

export const config = {
    matcher: [
        // Only run middleware on admin routes
        '/admin',
        '/admin/:path*',
    ],
};