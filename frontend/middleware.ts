import { NextResponse, type NextRequest } from 'next/server';

// Session lives in localStorage (Supabase default storage).
// Server-side cookie checks always see no session → redirect loop.
// Auth + admin gating is handled entirely client-side by:
//   - (app)/layout.tsx for authenticated routes
//   - admin/layout.tsx for admin role check
export function middleware(request: NextRequest) {
    return NextResponse.next();
}

export const config = {
    matcher: [],
};