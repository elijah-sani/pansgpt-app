import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email-service';

export async function POST(request: NextRequest) {
    try {
        const { name, email } = await request.json();

        if (!name || !email) {
            return NextResponse.json(
                { error: 'Name and email are required' },
                { status: 400 }
            );
        }

        // Build the login URL based on the request origin
        const origin = request.headers.get('origin') || 'https://pansgpt.site';
        const loginUrl = `${origin}/login`;

        const result = await sendWelcomeEmail(name, email, loginUrl);

        if (result.success) {
            return NextResponse.json({ success: true });
        } else {
            console.error('Welcome email failed:', result.error);
            // Return success to client anyway — email failure shouldn't block signup
            return NextResponse.json({ success: true, emailSent: false });
        }
    } catch (error: any) {
        console.error('Welcome email API error:', error);
        // Non-blocking — don't fail the signup flow
        return NextResponse.json({ success: true, emailSent: false });
    }
}
