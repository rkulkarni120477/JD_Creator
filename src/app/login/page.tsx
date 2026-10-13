import Image from 'next/image';
import { LoginForm } from './LoginForm';

type LoginPageProps = {
  searchParams?: { error?: string };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const microsoftEnabled = Boolean(
    process.env.AZURE_AD_TENANT_ID &&
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-soft sm:p-9">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <Image
              src="/academian-logo.svg"
              alt="Academian logo"
              width={40}
              height={40}
              priority
              className="h-10 w-10 object-contain"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">JD Creator</h1>
            <p className="text-sm text-slate-600">Sign in to continue</p>
          </div>
        </div>

        {searchParams?.error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Microsoft sign-in could not be completed. Check the Entra app registration and try again.
          </p>
        )}

        <LoginForm
          microsoftEnabled={microsoftEnabled}
          manualLoginConfigured={Boolean(process.env.JD_ADMIN_PASSWORD)}
        />
      </section>
    </main>
  );
}
