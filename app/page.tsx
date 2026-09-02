import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-between px-6 py-10 sm:justify-center sm:gap-16">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center sm:flex-none">
        <div className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-cork-red shadow-card">
          <BusGlyph className="h-10 w-10 text-white" />
        </div>

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-neutral-900">
            Cork City
            <br />
            Bus Live
          </h1>
          <p className="max-w-xs text-balance text-[15px] leading-relaxed text-neutral-500">
            See every Bus Éireann bus moving around Cork city right now, on a
            clean live map.
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <Link
          href="/map"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cork-red px-6 py-4 text-[17px] font-semibold text-white shadow-card transition-transform active:scale-[0.97]"
        >
          Open Live Map
        </Link>
        <p className="max-w-xs text-center text-[12px] leading-relaxed text-neutral-400">
          Uses your location to show nearby stops. Live positions from the
          National Transport Authority.
          <br />
          Not affiliated with Bus Éireann or the NTA.
        </p>
      </div>
    </main>
  );
}

function BusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="12.5" rx="4" fill="currentColor" />
      <rect x="5.5" y="6.5" width="4" height="3.5" rx="1" fill="#C8102E" />
      <rect x="10.5" y="6.5" width="4" height="3.5" rx="1" fill="#C8102E" />
      <rect x="15.5" y="6.5" width="3" height="3.5" rx="1" fill="#C8102E" />
      <circle cx="7.5" cy="18.5" r="2" fill="currentColor" />
      <circle cx="16.5" cy="18.5" r="2" fill="currentColor" />
    </svg>
  );
}
