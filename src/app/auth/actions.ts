'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOrigin } from '@/lib/auth';

export type FormState = { error?: string; info?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Só aceita caminhos internos (evita redirecionar para outro site). */
function safeNext(next: FormDataEntryValue | null): string | null {
  const n = typeof next === 'string' ? next : '';
  return n.startsWith('/') && !n.startsWith('//') ? n : null;
}

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData.get('email')).toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!EMAIL.test(email) || !password) return { error: 'Digite seu e-mail e sua senha.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) return { error: 'Confirme seu e-mail antes de entrar. Procure a mensagem de confirmação na sua caixa de entrada.' };
    return { error: 'E-mail ou senha incorretos.' };
  }
  redirect(safeNext(formData.get('next')) ?? '/painel');
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData.get('email')).toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!EMAIL.test(email)) return { error: 'Digite um e-mail válido.' };
  if (password.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.' };
  if (formData.get('terms') !== 'on') return { error: 'Marque que você leu a política de privacidade para continuar.' };

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) {
    if (/already|registered/i.test(error.message)) return { error: 'Esse e-mail já tem cadastro. Use "Entrar".' };
    if (/rate|too many|seconds/i.test(error.message)) return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' };
    return { error: 'Não foi possível criar a conta. Confira os dados e tente de novo.' };
  }
  if (data.session) redirect('/onboarding'); // projeto sem confirmação de e-mail
  return { info: `Enviamos um link de confirmação para ${email}. Abra o e-mail e clique no link para continuar. Confira também o spam.` };
}

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData.get('email')).toLowerCase();
  if (!EMAIL.test(email)) return { error: 'Digite um e-mail válido.' };
  const supabase = await createClient();
  const origin = await getOrigin();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha` });
  // Resposta igual exista o e-mail ou não, para não revelar quem tem cadastro.
  return { info: 'Se esse e-mail tiver cadastro, enviamos um link para criar uma nova senha.' };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'O link expirou. Peça um novo em "Esqueci a senha".' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'Não foi possível trocar a senha. Tente de novo.' };
  redirect('/painel');
}
