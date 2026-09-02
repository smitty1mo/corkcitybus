export function formatEtaLabel(arrivalUnix: number | null, nowMs: number = Date.now()): string {
  if (arrivalUnix === null) return "ETA unavailable";
  const diffMs = arrivalUnix * 1000 - nowMs;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin <= 0) return "Due now";
  if (diffMin === 1) return "1 min";
  if (diffMin < 60) return `${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `${hours}h ${mins}m`;
}

export function formatClockTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-IE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeAgo(unixSeconds: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.round(nowMs / 1000 - unixSeconds));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
