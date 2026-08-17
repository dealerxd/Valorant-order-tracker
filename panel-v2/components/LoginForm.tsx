'use client';

import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, signUp } from '@/lib/actions';
import { C, FONT_DISPLAY, goldButton, pillGroup } from '@/lib/ui';

/** Email + password sign-in, and sign-up gated by an invite code.
    The prototype's "continue with sample data" mode is deliberately absent:
    it existed so the design could be reviewed without credentials. */
export function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/overview';
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const [signInState, signInAction, signInPending] = useActionState(signIn, {});
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, {});

  const state = mode === 'login' ? signInState : signUpState;
  const pending = mode === 'login' ? signInPending : signUpPending;

  const tab = (on: boolean): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 8, padding: '8px 15px',
    fontFamily: FONT_DISPLAY, fontSize: 12.5, letterSpacing: '.5px', textTransform: 'uppercase',
    background: on ? '#1f1c14' : 'transparent', color: on ? C.gold : C.muted,
  });

  const field: React.CSSProperties = {
    background: C.surface0, border: `1px solid ${C.border2}`, borderRadius: 10,
    color: C.text, padding: 12, fontSize: 14, outline: 'none', width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>
        {mode === 'login'
          ? 'Same account as the old panel — orders, finance and tracker data load from Supabase.'
          : 'You need an invite code from the admin.'}
      </div>

      <div style={{ ...pillGroup, margin: '18px 0 14px', width: 'fit-content' }}>
        <button type="button" onClick={() => setMode('login')} style={tab(mode === 'login')}>Sign in</button>
        <button type="button" onClick={() => setMode('signup')} style={tab(mode === 'signup')}>Sign up</button>
      </div>

      <form action={mode === 'login' ? signInAction : signUpAction}>
        <input type="hidden" name="next" value={next} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input name="email" type="email" placeholder="e-mail" autoComplete="email" required style={field} />
          <input
            name="password"
            type="password"
            placeholder="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            style={field}
          />
          {mode === 'signup' && (
            <>
              <input name="display_name" type="text" placeholder="display name" style={field} />
              <input name="invite_code" type="text" placeholder="invite code" style={field} />
            </>
          )}
        </div>

        {(state.error || state.message) && (
          <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 12, color: state.error ? C.red : C.green }}>
            {state.error || state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{ ...goldButton, width: '100%', marginTop: 14, padding: 13, fontSize: 14 }}
        >
          {pending ? '…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
    </>
  );
}
