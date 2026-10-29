import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE } from '../lib/auth-cookie';

// Signed-in visitors go straight to their workspace instead of bouncing through /login.
export default async function Home() {
  redirect((await cookies()).get(AUTH_COOKIE) ? '/dashboard' : '/login');
}
