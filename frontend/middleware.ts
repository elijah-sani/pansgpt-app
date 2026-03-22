import { NextResponse, type NextRequest } from 'next/server';

// PansGPT uses Supabase with localStorage (not cookies), so we can't read
// the full JWT server-side. Instead, admin layout sets a short-lived
// `pansgpt-admin-verified` cookie after the backend confirms is_admin.
// Middleware checks for this cookie as a first-pass guard on /admin/* routes.
// The REAL security check is still the backend JWT + is_admin validation.
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Guard /admin/* routes
    if (pathname.startsWith('/admin')) {
        const adminCookie = request.cookies.get('pansgpt-admin-verified');
        if (!adminCookie?.value) {
            // No admin cookie — redirect to login
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};