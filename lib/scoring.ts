import { AnalysisResult } from '@/types';

type MetricKey = 'loadTime' | 'memory' | 'size';

const metrics: MetricKey[] = ['loadTime', 'memory', 'size'];

export function calculateScores(results: AnalysisResult[]): AnalysisResult[] {
  const successResults = results.filter((r) => r.status === 'success');

  if (successResults.length === 0) {
    return results;
  }

  const min: Record<MetricKey, number> = { loadTime: Infinity, memory: Infinity, size: Infinity };
  const max: Record<MetricKey, number> = { loadTime: -Infinity, memory: -Infinity, size: -Infinity };

  for (const m of metrics) {
    const values = successResults.map((r) => r[m]);
    min[m] = Math.min(...values);
    max[m] = Math.max(...values);
  }

  for (const r of successResults) {
    let totalScore = 0;

    for (const m of metrics) {
      const value = r[m];
      const mi = min[m];
      const ma = max[m];

      let norm: number;
      if (ma === mi) {
        norm = 50;
      } else {
        norm = 100 * (1 - (value - mi) / (ma - mi));
      }
      totalScore += norm;
    }

    r.score = Math.round((totalScore / 3) * 10) / 10;
  }

  // Error items keep score 0 (lowest priority display handled by sorting)
  return results;
}

export function sortByPriority(results: AnalysisResult[]): AnalysisResult[] {
  return [...results].sort((a, b) => {
    // Errors first (status sort), then lower score first
    if (a.status === 'error' && b.status !== 'error') return -1;
    if (a.status !== 'error' && b.status === 'error') return 1;
    return a.score - b.score;
  });
}
