export type Grade = 'good' | 'moderate' | 'poor' | 'critical';

export interface AnalysisResult {
  url: string;
  slug: string;
  loadTime: number; // 초
  memory: number; // MB
  size: number; // MB (네트워크 전송 총량)
  screenshotPath: string;
  status: 'success' | 'error';
  errorMessage?: string;
  analyzedAt: string; // ISO timestamp

  // Objective grades based on threshold table
  loadTimeGrade: Grade;
  memoryGrade: Grade;
  sizeGrade: Grade;
  priorityScore: number; // 0~9, higher = more urgent to improve
}

export interface UrlItem {
  url: string;
  checked: boolean;
}

export interface UrlListResponse {
  urls: UrlItem[];
  syncedAt?: string;
  message?: string;
}

export interface SyncResponse {
  success: boolean;
  count: number;
  urls: string[];
  message?: string;
}

export interface AnalyzePayload {
  urls: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  results: AnalysisResult[];
  totalCount: number;
  successCount: number;
  failCount: number;
  message?: string;
}
