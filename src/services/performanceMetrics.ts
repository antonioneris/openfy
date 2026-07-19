export type PerformanceMetricName = 'time-to-first-content' | 'library-indexation' | 'time-to-first-audio';

export interface PerformanceMetric {
  name: PerformanceMetricName;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, string | number | boolean>;
}

const STORAGE_KEY = 'openfy_performance_metrics';
const MAX_METRICS = 50;
const appBootStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
let firstContentRecorded = false;
let firstAudioRecorded = false;

export function getPerformanceMetrics(): PerformanceMetric[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function recordPerformanceMetric(
  name: PerformanceMetricName,
  durationMs: number,
  metadata?: PerformanceMetric['metadata']
): PerformanceMetric {
  const metric = {
    name,
    durationMs: Math.max(0, Math.round(durationMs)),
    timestamp: Date.now(),
    metadata,
  };
  try {
    const metrics = [...getPerformanceMetrics(), metric].slice(-MAX_METRICS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
    window.dispatchEvent(new CustomEvent('openfy-performance-metric', { detail: metric }));
  } catch {
    // Metrics must never interfere with playback or library loading.
  }
  return metric;
}

export function recordFirstContentMetric() {
  if (firstContentRecorded || typeof performance === 'undefined') return;
  firstContentRecorded = true;
  recordPerformanceMetric('time-to-first-content', performance.now() - appBootStartedAt);
}

export function recordFirstAudioMetric(startedAt: number) {
  if (firstAudioRecorded || typeof performance === 'undefined') return;
  firstAudioRecorded = true;
  recordPerformanceMetric('time-to-first-audio', performance.now() - startedAt);
}
