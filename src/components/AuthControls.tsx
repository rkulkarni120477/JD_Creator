'use client';

import { signOut, useSession } from 'next-auth/react';

export function AuthControls() {
  const { data: session, status } = useSession();

  if (status !== 'authenticated' || !session.user) {
    return null;
  }

  return (
    <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
      <span className="max-w-[180px] truncate text-slate-600">
        <span className="hidden sm:inline">Signed in as </span>
        <strong className="font-medium text-slate-900">{session.user.name || session.user.email}</strong>
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/login' })}
        className="rounded-xl border border-slate-200 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Log out
      </button>
    </div>
  );
}
