/**
 * Display helpers used by the parse page (GPX and FIT).
 */

export function toPrettyBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function fmtDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "n/a";
  const seconds = Math.round(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function fmtKm(meters) {
  if (!Number.isFinite(meters)) return "n/a";
  return `${(meters / 1000).toFixed(2)} km`;
}

export function fmtMi(meters) {
  if (!Number.isFinite(meters)) return "n/a";
  return `${(meters / 1609.344).toFixed(2)} mi`;
}

export function fmtPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "n/a";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function fmtSpeedKph(meters, seconds) {
  if (!Number.isFinite(meters) || !Number.isFinite(seconds) || seconds <= 0) return "n/a";
  return `${((meters / 1000) / (seconds / 3600)).toFixed(2)} km/h`;
}

export function fmtSpeedFromMs(metersPerSecond) {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond <= 0) return "n/a";
  return `${(metersPerSecond * 3.6).toFixed(2)} km/h`;
}
