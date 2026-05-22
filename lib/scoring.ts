import { AnalysisResult, Grade } from '@/types';

/*
  Threshold table (objective, not relative)

  로딩 시간 (초)
    🟢 good     ≤ 1.8
    🟡 moderate  1.8 < x ≤ 3.0
    🟠 poor      3.0 < x ≤ 5.5
    🔴 critical  > 5.5

  JS 메모리 사용량 (MB)
    🟢 good     ≤ 50
    🟡 moderate  50 < x ≤ 100
    🟠 poor      100 < x ≤ 150
    🔴 critical  > 150

  리소스 다운로드 크기 (MB)
    🟢 good     ≤ 1.5
    🟡 moderate  1.5 < x ≤ 3.5
    🟠 poor      3.5 < x ≤ 6.0
    🔴 critical  > 6.0

  Priority score = sum of grade points (0~9)
    good = 0, moderate = 1, poor = 2, critical = 3
    Higher score = more urgent to improve
*/

function gradeLoadTime(seconds: number): Grade {
  if (seconds <= 1.8) return 'good';
  if (seconds <= 3.0) return 'moderate';
  if (seconds <= 5.5) return 'poor';
  return 'critical';
}

function gradeMemory(mb: number): Grade {
  if (mb <= 50) return 'good';
  if (mb <= 100) return 'moderate';
  if (mb <= 150) return 'poor';
  return 'critical';
}

function gradeSize(mb: number): Grade {
  if (mb <= 1.5) return 'good';
  if (mb <= 3.5) return 'moderate';
  if (mb <= 6.0) return 'poor';
  return 'critical';
}

const gradePoints: Record<Grade, number> = {
  good: 0,
  moderate: 1,
  poor: 2,
  critical: 3,
};

export function getGradeLabel(grade: Grade): string {
  const labels: Record<Grade, string> = {
    good: '쾌적',
    moderate: '중간',
    poor: '나쁨',
    critical: '매우 나쁨',
  };
  return labels[grade];
}

export function getGradeEmoji(grade: Grade): string {
  const emojis: Record<Grade, string> = {
    good: '🟢',
    moderate: '🟡',
    poor: '🟠',
    critical: '🔴',
  };
  return emojis[grade];
}

export function getGradeColorClass(grade: Grade): string {
  const classes: Record<Grade, string> = {
    good: 'bg-emerald-100 text-emerald-800',
    moderate: 'bg-yellow-100 text-yellow-800',
    poor: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };
  return classes[grade];
}

export function getPriorityColorClass(score: number): string {
  if (score >= 7) return 'bg-red-100 text-red-800';
  if (score >= 4) return 'bg-orange-100 text-orange-800';
  if (score >= 2) return 'bg-yellow-100 text-yellow-800';
  return 'bg-emerald-100 text-emerald-800';
}

export function calculateScores(results: AnalysisResult[]): AnalysisResult[] {
  for (const r of results) {
    if (r.status === 'error') {
      r.loadTimeGrade = 'critical';
      r.memoryGrade = 'critical';
      r.sizeGrade = 'critical';
      r.priorityScore = 9;
      continue;
    }

    r.loadTimeGrade = gradeLoadTime(r.loadTime);
    r.memoryGrade = gradeMemory(r.memory);
    r.sizeGrade = gradeSize(r.size);

    r.priorityScore =
      gradePoints[r.loadTimeGrade] +
      gradePoints[r.memoryGrade] +
      gradePoints[r.sizeGrade];
  }

  return results;
}

export function sortByPriority(results: AnalysisResult[]): AnalysisResult[] {
  return [...results].sort((a, b) => {
    // Errors first, then higher priority score first (more urgent)
    if (a.status === 'error' && b.status !== 'error') return -1;
    if (a.status !== 'error' && b.status === 'error') return 1;

    // Higher priority score = worse = comes first
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    // Tie-breaker: worst single metric
    const aWorst = Math.max(
      gradePoints[a.loadTimeGrade],
      gradePoints[a.memoryGrade],
      gradePoints[a.sizeGrade]
    );
    const bWorst = Math.max(
      gradePoints[b.loadTimeGrade],
      gradePoints[b.memoryGrade],
      gradePoints[b.sizeGrade]
    );
    return bWorst - aWorst;
  });
}
