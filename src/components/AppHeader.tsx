import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
          <Image
            src="/academian-logo.svg"
            alt="Academian logo"
            width={40}
            height={40}
            priority
            className="h-10 w-10 object-contain"
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">JD Creator</h1>
          </div>
          <p className="text-sm text-slate-600">
            Professional job descriptions, tailored to your hiring needs.
          </p>
        </div>
      </div>
    </header>
  );
}
