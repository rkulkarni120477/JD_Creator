'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type LoginFormProps = {
  microsoftEnabled: boolean;
  manualLoginConfigured: boolean;
};

export function LoginForm({ microsoftEnabled, manualLoginConfigured }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false
      });

      if (result?.ok) {
        router.replace('/');
        router.refresh();
      } else {
        setError('The username or password is incorrect.');
      }
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <div>
        <button
          type="button"
          disabled={!microsoftEnabled}
          onClick={() => void signIn('azure-ad', { callbackUrl: '/' })}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          <span aria-hidden="true" className="text-lg font-bold text-blue-600">M</span>
          Sign in with Microsoft
        </button>
        {!microsoftEnabled && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Microsoft sign-in will be enabled after the Academian Entra app registration values are configured.
          </p>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            Or use your account
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="label">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {!manualLoginConfigured && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Manual sign-in is not configured on this server. Set JD_ADMIN_PASSWORD in its environment.
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !manualLoginConfigured}
          className="primary-btn w-full py-3"
        >
          {isSubmitting ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
