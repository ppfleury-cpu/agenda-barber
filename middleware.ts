import type { NextRequest } from 'next/server';
import { updateSession } from './src/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Só as áreas com login passam por aqui. A página pública de agendamento não precisa.
export const config = {
  matcher: ['/painel/:path*', '/admin/:path*', '/onboarding', '/login', '/cadastro'],
};
