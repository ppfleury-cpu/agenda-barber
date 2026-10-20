'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPassword, login, resetPassword, signup, type FormState } from './actions';

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state?.error ? <p className="flash bad" role="alert">{state.error}</p> : null}
      {state?.info ? <p className="flash ok" role="status">{state.info}</p> : null}
    </>
  );
}

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(login, null as FormState);
  return (
    <form action={action} className="card">
      {linkError ? <p className="flash warn">Esse link expirou ou já foi usado. Entre com seu e-mail e senha.</p> : null}
      <input type="hidden" name="next" value={next ?? ''} />
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Messages state={state} />
      <button className="btn primary" disabled={pending}>{pending ? 'Entrando...' : 'Entrar'}</button>
      <p className="note"><Link href="/esqueci-senha">Esqueci a senha</Link></p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, null as FormState);
  return (
    <form action={action} className="card">
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha (mínimo 8 caracteres)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <label className="check">
        <input type="checkbox" name="terms" />
        <span>Li e concordo com a <Link href="/privacidade" target="_blank">política de privacidade</Link>.</span>
      </label>
      <Messages state={state} />
      <button className="btn primary" disabled={pending}>{pending ? 'Criando...' : 'Criar conta'}</button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPassword, null as FormState);
  return (
    <form action={action} className="card">
      <div className="field">
        <label htmlFor="email">E-mail do cadastro</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Messages state={state} />
      <button className="btn primary" disabled={pending}>{pending ? 'Enviando...' : 'Enviar link'}</button>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState(resetPassword, null as FormState);
  return (
    <form action={action} className="card">
      <div className="field">
        <label htmlFor="password">Nova senha (mínimo 8 caracteres)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Messages state={state} />
      <button className="btn primary" disabled={pending}>{pending ? 'Salvando...' : 'Salvar nova senha'}</button>
    </form>
  );
}
