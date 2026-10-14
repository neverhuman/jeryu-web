// duration.ts — seconds in the words a person would use.

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

/** Whole minutes, rounded up ("3m", "1h 5m"): for estimates, where seconds are noise. */
export function minutesWords(totalSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
  return durationWords(minutes * 60);
}

/**
 * The same, with days once the span is longer than one ("1.0 d", "2.1 d"):
 * for a cycle time or a wait that runs past an hour count a reader can hold.
 */
export function spanWords(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const day = 24 * 60 * 60;
  if (seconds < day) return durationWords(seconds);
  return `${(seconds / day).toFixed(1)} d`;
}
