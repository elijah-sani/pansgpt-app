import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicRoutes = new Set([
    '/',
    '/login',
    '/about',
    '/contact',
    '/faq',
    '/feedback',
    '/privacy',
    '/terms',
    '/download',
    '/auth/callback',
    '/reset-password',
]);

function isPublicRoute(pathname: string): boolean {
    if (publicRoutes.has(pathname)) {
        return true;
    }

    return false;
}

function isProtectedRoute(pathname: string): boolean {
    return pathname.startsWith('/admin/') ||
        pathname === '/admin' ||
        !isPublicRoute(pathname);
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!isProtectedRoute(pathname)) {
        return NextResponse.next();
    }

    let response = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
                    response = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirectedFrom', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2)$).*)',
    ],
};
