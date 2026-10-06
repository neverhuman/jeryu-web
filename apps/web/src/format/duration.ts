// duration.ts — seconds as a person says them.

/** 14 -> "14s", 127 -> "2m 7s", 3780 -> "1h 3m". */
export function durationWords(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}

/** Whole minutes, rounded up, as "3m" or "1h 5m": for estimates, where seconds are noise. */
export function minutesWords(totalSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
  return durationWords(minutes * 60);
}
