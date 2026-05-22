export interface AnalysisResult {
  url: string;
  slug: string;
  loadTime: number; // 초
  memory: number; // MB
  size: number; // MB (네트워크 전송 총량)
  screenshotPath: string;
  score: number; // 0~100 (낮을수록 개선 필요)
  status: 'success' | 'error';
  errorMessage?: string;
  analyzedAt: string; // ISO timestamp
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
