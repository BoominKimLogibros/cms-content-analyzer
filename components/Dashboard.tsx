'use client';

import { useEffect, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AnalysisResult, UrlItem, UrlListResponse, AnalyzeResponse } from '@/types';
import { getGradeEmoji, getGradeLabel, getGradeColorClass, getPriorityColorClass } from '@/lib/scoring';

type SortKey = 'slug' | 'url' | 'loadTime' | 'memory' | 'size' | 'priorityScore' | 'status';
type SortDirection = 'asc' | 'desc';
type ResultSort = { key: SortKey; direction: SortDirection };

interface SortHeaderProps {
  sortKey: SortKey;
  currentSort: ResultSort;
  onSort: (key: SortKey) => void;
  children: ReactNode;
  className: string;
  title?: string;
  align?: 'left' | 'center';
}

interface SseProgressData {
  current: number;
  total: number;
  percentage: number;
}

interface SseCompleteData {
  results: AnalysisResult[];
  totalCount: number;
  successCount: number;
  failCount: number;
}

interface SseMessageData {
  message?: string;
  current?: number;
  total?: number;
  percentage?: number;
  results?: AnalysisResult[];
  totalCount?: number;
  successCount?: number;
  failCount?: number;
}

function estimateDuration(urlCount: number): string {
  if (urlCount <= 0) return '0초';
  const batches = Math.ceil(urlCount / 5);
  const seconds = batches * 3;
  if (seconds < 60) return `약 ${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `약 ${minutes}분 ${rem}초` : `약 ${minutes}분`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProgressData(data: SseMessageData): data is SseProgressData {
  return (
    typeof data.current === 'number' &&
    typeof data.total === 'number' &&
    typeof data.percentage === 'number'
  );
}

function isCompleteData(data: SseMessageData): data is SseCompleteData {
  return (
    Array.isArray(data.results) &&
    typeof data.totalCount === 'number' &&
    typeof data.successCount === 'number' &&
    typeof data.failCount === 'number'
  );
}

function SortHeader({
  sortKey,
  currentSort,
  onSort,
  children,
  className,
  title,
  align = 'center',
}: SortHeaderProps) {
  const isActive = currentSort.key === sortKey;
  const sortLabel = isActive ? (currentSort.direction === 'asc' ? '오름차순' : '내림차순') : '정렬';
  const justifyClass = align === 'left' ? 'justify-start' : 'justify-center';

  return (
    <th className={className} title={title}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex w-full items-center ${justifyClass} gap-1.5 rounded px-1 py-1 text-inherit hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-label={`${String(children)} ${sortLabel}`}
      >
        <span>{children}</span>
        <svg
          className={`h-3.5 w-3.5 transition-colors ${isActive ? 'text-gray-800' : 'text-gray-300'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isActive && currentSort.direction === 'desc' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          )}
        </svg>
      </button>
    </th>
  );
}

export default function Dashboard() {
  const [urlItems, setUrlItems] = useState<UrlItem[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [message, setMessage] = useState('');
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [showUrlList, setShowUrlList] = useState(false);
  const [randomCount, setRandomCount] = useState<number>(10);
  const [resultSort, setResultSort] = useState<ResultSort>({
    key: 'priorityScore',
    direction: 'desc',
  });

  // Streaming analysis state
  const [progress, setProgress] = useState<{ current: number; total: number; percentage: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [eta, setEta] = useState<string>('');

  // Per-row re-analysis state
  const [reanalyzingUrls, setReanalyzingUrls] = useState<Set<string>>(new Set());
  const [logModal, setLogModal] = useState<{ open: boolean; title: string; logs: string[] }>({
    open: false,
    title: '',
    logs: [],
  });

  const checkedItems = useMemo(() => urlItems.filter((u) => u.checked), [urlItems]);
  const checkedCount = checkedItems.length;
  const totalCount = urlItems.length;

  useEffect(() => {
    fetchUrlItems();
    fetchResults();
  }, []);

  async function fetchUrlItems() {
    try {
      const res = await fetch('/api/urls');
      const data: UrlListResponse = await res.json();
      setUrlItems(data.urls);
    } catch {
      // ignore
    }
  }

  async function fetchResults() {
    try {
      const res = await fetch('/api/analyze');
      const data: AnalyzeResponse = await res.json();
      if (data.success) {
        setResults(data.results);
      }
    } catch {
      // ignore
    }
  }

  async function saveUrlItemsToServer(items: UrlItem[]) {
    try {
      await fetch('/api/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
    } catch {
      // ignore
    }
  }

  function updateItems(items: UrlItem[]) {
    setUrlItems(items);
    saveUrlItemsToServer(items);
  }

  function toggleCheck(index: number) {
    const newItems = [...urlItems];
    newItems[index] = { ...newItems[index], checked: !newItems[index].checked };
    updateItems(newItems);
  }

  function toggleAll() {
    const allChecked = urlItems.every((u) => u.checked);
    const newItems = urlItems.map((u) => ({ ...u, checked: !allChecked }));
    updateItems(newItems);
  }

  function handleRandomSelect() {
    if (urlItems.length === 0) return;
    const count = Math.min(randomCount, urlItems.length);
    const indices = new Set<number>();
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * urlItems.length));
    }
    const newItems = urlItems.map((u, i) => ({ ...u, checked: indices.has(i) }));
    updateItems(newItems);
    setMessage(`${count}개 URL이 랜덤으로 선택되었습니다.`);
  }

  function handleRemoveChecked() {
    if (checkedCount === 0) {
      setMessage('제거할 URL을 먼저 선택해 주세요.');
      return;
    }
    const newItems = urlItems.filter((u) => !u.checked);
    updateItems(newItems);
    setMessage(`${checkedCount}개 URL이 제거되었습니다.`);
  }

  async function handleSync() {
    setLoadingSync(true);
    setMessage('');
    try {
      const res = await fetch('/api/urls/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchUrlItems();
        setMessage(`URL ${data.count}개 동기화 완료`);
      } else {
        setMessage(`동기화 실패: ${data.message}`);
      }
    } catch (err: unknown) {
      setMessage(`동기화 오류: ${getErrorMessage(err)}`);
    } finally {
      setLoadingSync(false);
    }
  }

  async function handleAnalyze() {
    if (checkedCount === 0) {
      setMessage('분석할 URL을 먼저 선택해 주세요.');
      return;
    }

    setLoadingAnalyze(true);
    setMessage('');
    setProgress(null);
    setLogs([]);
    setEta('');

    const startTime = Date.now();
    const urls = checkedItems.map((u) => u.url);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE messages (separated by double newline)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const msg of messages) {
          if (!msg.trim()) continue;

          const lines = msg.split('\n');
          let eventType = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!eventType || !dataStr) continue;

          try {
            const data = JSON.parse(dataStr) as SseMessageData;

            switch (eventType) {
              case 'log': {
                const logMessage = data.message;
                if (logMessage) {
                  setLogs((prev) => [...prev, logMessage]);
                }
                break;
              }
              case 'progress': {
                if (!isProgressData(data)) break;
                setProgress(data);
                // Calculate ETA
                const elapsed = (Date.now() - startTime) / 1000;
                const avgPerItem = elapsed / data.current;
                const remaining = avgPerItem * (data.total - data.current);
                if (remaining > 60) {
                  const mins = Math.floor(remaining / 60);
                  const secs = Math.round(remaining % 60);
                  setEta(`${mins}분 ${secs}초 남음`);
                } else {
                  setEta(`${Math.round(remaining)}초 남음`);
                }
                break;
              }
              case 'result': {
                // Individual result if needed
                break;
              }
              case 'complete': {
                if (!isCompleteData(data)) break;
                setResults(data.results);
                setMessage(
                  `${data.totalCount}개 분석 완료 (성공 ${data.successCount}개, 실패 ${data.failCount}개)`
                );
                setEta('');
                setProgress(null);
                break;
              }
              case 'error': {
                setMessage(`분석 오류: ${data.message || '알 수 없는 오류'}`);
                setEta('');
                setProgress(null);
                break;
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: unknown) {
      setMessage(`분석 오류: ${getErrorMessage(err)}`);
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function handleReanalyze(url: string) {
    setReanalyzingUrls((prev) => new Set(prev).add(url));
    setMessage('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const msg of messages) {
          if (!msg.trim()) continue;
          const lines = msg.split('\n');
          let eventType = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }
          if (!eventType || !dataStr) continue;

          try {
            const data = JSON.parse(dataStr) as SseMessageData;
            if (eventType === 'complete') {
              if (!isCompleteData(data)) continue;
              setResults(data.results);
              setMessage(`"${url.split('/').pop()}" 재분석 완료`);
            } else if (eventType === 'error') {
              setMessage(`재분석 오류: ${data.message || '알 수 없는 오류'}`);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err: unknown) {
      setMessage(`재분석 오류: ${getErrorMessage(err)}`);
    } finally {
      setReanalyzingUrls((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  }

  const estimatedTime = useMemo(() => estimateDuration(checkedCount), [checkedCount]);

  const hasUrls = totalCount > 0;
  const allChecked = hasUrls && urlItems.every((u) => u.checked);

  const sortedResults = useMemo(() => {
    const directionMultiplier = resultSort.direction === 'asc' ? 1 : -1;

    return results
      .map((result, index) => ({ result, index }))
      .sort((a, b) => {
        const aValue = a.result[resultSort.key];
        const bValue = b.result[resultSort.key];
        let comparison = 0;

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue), 'ko', {
            numeric: true,
            sensitivity: 'base',
          });
        }

        if (comparison === 0) return a.index - b.index;
        return comparison * directionMultiplier;
      })
      .map(({ result }) => result);
  }, [results, resultSort]);

  function toggleResultSort(key: SortKey) {
    setResultSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">CMS 컨텐츠 분석기</h1>
      <p className="text-gray-500 mb-8">CDN에 올라간 CMS 컨텐츠의 로딩 성능을 측정하고 개선 우선순위를 확인합니다.</p>

      {/* Main Buttons */}
      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={handleSync}
          disabled={loadingSync || loadingAnalyze}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loadingSync ? '동기화 중...' : 'URL 목록 동기화'}
        </button>

        <button
          onClick={handleAnalyze}
          disabled={checkedCount === 0 || loadingSync || loadingAnalyze}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-semibold"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {loadingAnalyze ? '분석 중...' : `분석 시작 (${checkedCount}개)`}
        </button>
      </div>

      {/* Info Bar */}
      {hasUrls && (
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-600">
          <span>
            전체 URL: <strong className="text-gray-900">{totalCount.toLocaleString()}개</strong>
          </span>
          <span className="text-gray-300">|</span>
          <span>
            선택됨: <strong className="text-emerald-600">{checkedCount}개</strong>
          </span>
          <span className="text-gray-300">|</span>
          <span>
            예상 소요시간: <strong className="text-gray-900">{estimatedTime}</strong>
          </span>
          {checkedCount === 0 && (
            <span className="text-amber-600 font-medium">
              (URL 목록을 펼쳐서 체크하세요)
            </span>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {message}
        </div>
      )}

      {/* Analysis Progress */}
      {loadingAnalyze && progress && (
        <div className="mb-6 p-5 bg-gray-900 rounded-xl text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span className="font-semibold text-sm">분석 진행 중...</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold tabular-nums">{progress.percentage}%</span>
              <span className="text-xs text-gray-400 ml-2">({progress.current} / {progress.total}개)</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>

          {/* ETA */}
          {eta && (
            <div className="text-xs text-gray-400 mb-3">
              예상 남은 시간: <span className="text-emerald-400 font-medium">{eta}</span>
            </div>
          )}

          {/* Log Window */}
          <div className="bg-black/50 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 && (
              <span className="text-gray-500">로그 수신 중...</span>
            )}
            {logs.map((log, i) => (
              <div key={i} className="text-gray-300 break-all">
                <span className="text-gray-500 mr-1">{i + 1}.</span>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* URL List Toggle */}
      {hasUrls && (
        <div className="mb-4">
          <button
            onClick={() => setShowUrlList(!showUrlList)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-gray-600 transition-colors bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showUrlList ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            URL 목록 관리 ({checkedCount}/{totalCount}개 선택됨)
            <span className="text-xs text-gray-500 font-normal ml-1">
              {showUrlList ? '접기' : '펼치기'}
            </span>
          </button>
        </div>
      )}

      {/* URL List Panel */}
      {showUrlList && hasUrls && (
        <div className="mb-8 border border-gray-200 rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm text-gray-600">전체 선택</span>
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">랜덤 선택:</span>
              <input
                type="number"
                min={1}
                max={totalCount}
                value={randomCount}
                onChange={(e) => setRandomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <span className="text-sm text-gray-500">개</span>
              <button
                onClick={handleRandomSelect}
                className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors font-medium"
              >
                랜덤 적용
              </button>
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <button
              onClick={handleRemoveChecked}
              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors font-medium"
            >
              체크된 항목 제거 ({checkedCount}개)
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-4 w-10" />
                  <th className="py-2 px-4 text-left">파일명</th>
                  <th className="py-2 px-4 text-left">URL</th>
                </tr>
              </thead>
              <tbody>
                {urlItems.map((item, idx) => (
                  <tr
                    key={item.url}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                      item.checked ? '' : 'opacity-40'
                    }`}
                    onClick={() => toggleCheck(idx)}
                  >
                    <td className="py-2 px-4">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer pointer-events-none"
                      />
                    </td>
                    <td className="py-2 px-4 text-sm text-gray-700 font-medium">
                      {item.url.split('/').pop() || item.url}
                    </td>
                    <td className="py-2 px-4 text-sm text-gray-500 truncate max-w-md">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline block truncate text-left"
                        title={item.url}
                        style={{ direction: 'rtl' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.url}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4 text-gray-900">분석 결과</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center whitespace-nowrap w-16" title="개선이 시급한 순서 (개선 필요도 높은 순)">#</th>
                  <SortHeader sortKey="slug" currentSort={resultSort} onSort={toggleResultSort} align="left" className="py-3 px-3 text-left whitespace-nowrap min-w-[120px]">파일명</SortHeader>
                  <SortHeader sortKey="url" currentSort={resultSort} onSort={toggleResultSort} align="left" className="py-3 px-3 text-left whitespace-nowrap min-w-[240px]">URL</SortHeader>
                  <SortHeader sortKey="loadTime" currentSort={resultSort} onSort={toggleResultSort} className="py-3 px-3 text-center whitespace-nowrap w-28" title="🟢 쾌적: ≤1.8초 / 🟡 중간: 1.8~3.0초 / 🟠 나쁨: 3.0~5.5초 / 🔴 매우 나쁨: >5.5초">로딩 시간</SortHeader>
                  <SortHeader sortKey="memory" currentSort={resultSort} onSort={toggleResultSort} className="py-3 px-3 text-center whitespace-nowrap w-32" title="🟢 쾌적: ≤50MB / 🟡 중간: 50~100MB / 🟠 나쁨: 100~150MB / 🔴 매우 나쁨: >150MB">JS 메모리</SortHeader>
                  <SortHeader sortKey="size" currentSort={resultSort} onSort={toggleResultSort} className="py-3 px-3 text-center whitespace-nowrap w-32" title="🟢 쾌적: ≤1.5MB / 🟡 중간: 1.5~3.5MB / 🟠 나쁨: 3.5~6.0MB / 🔴 매우 나쁨: >6.0MB">다운로드</SortHeader>
                  <SortHeader sortKey="priorityScore" currentSort={resultSort} onSort={toggleResultSort} className="py-3 px-3 text-center whitespace-nowrap w-24" title="3가지 지표의 등급 점수 합계 (0~9). 높을수록 개선이 시급.">개선 필요도</SortHeader>
                  <SortHeader sortKey="status" currentSort={resultSort} onSort={toggleResultSort} className="py-3 px-3 text-center whitespace-nowrap w-20">상태</SortHeader>
                  <th className="py-3 px-3 text-center whitespace-nowrap w-28">스크린샷</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap w-24">액션</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, idx) => {
                  const isReanalyzing = reanalyzingUrls.has(r.url);

                  return (
                  <tr
                    key={`${r.url}-${idx}`}
                    className={`border-b transition-colors ${
                      isReanalyzing
                        ? 'border-blue-200 bg-blue-50 shadow-[inset_4px_0_0_#2563eb]'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    {/* Priority # */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-bold tabular-nums">
                        {idx + 1}
                      </span>
                    </td>

                    {/* Slug */}
                    <td className="py-3 px-3">
                      <span className="font-medium text-gray-800 truncate block max-w-[140px]" title={r.slug}>
                        {r.slug}
                      </span>
                    </td>

                    {/* URL */}
                    <td className="py-3 px-3">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline truncate block max-w-[260px]"
                        title={r.url}
                        style={{ direction: 'rtl' }}
                      >
                        {r.url}
                      </a>
                    </td>

                    {/* Load Time */}
                    <td className="py-3 px-3 text-center">
                      {r.status === 'success' ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-gray-800 font-medium tabular-nums">{r.loadTime.toFixed(2)}초</span>
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getGradeColorClass(r.loadTimeGrade)}`}>
                            {getGradeEmoji(r.loadTimeGrade)} {getGradeLabel(r.loadTimeGrade)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Memory */}
                    <td className="py-3 px-3 text-center">
                      {r.status === 'success' ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-gray-800 font-medium tabular-nums">{r.memory.toFixed(1)} MB</span>
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getGradeColorClass(r.memoryGrade)}`}>
                            {getGradeEmoji(r.memoryGrade)} {getGradeLabel(r.memoryGrade)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Size */}
                    <td className="py-3 px-3 text-center">
                      {r.status === 'success' ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-gray-800 font-medium tabular-nums">{r.size.toFixed(1)} MB</span>
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getGradeColorClass(r.sizeGrade)}`}>
                            {getGradeEmoji(r.sizeGrade)} {getGradeLabel(r.sizeGrade)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Priority Score */}
                    <td className="py-3 px-3 text-center">
                      {r.status === 'success' ? (
                        <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-lg text-xs font-bold tabular-nums ${getPriorityColorClass(r.priorityScore)}`}>
                          {r.priorityScore}점
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      {r.status === 'error' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                          실패
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                          정상
                        </span>
                      )}
                    </td>

                    {/* Screenshot */}
                    <td className="py-3 px-3 text-center">
                      {r.screenshotPath ? (
                        <button
                          onClick={() => setModalImage(r.screenshotPath)}
                          className="p-0 border-0 bg-transparent cursor-pointer inline-block"
                        >
                          <img
                            src={r.screenshotPath}
                            alt={r.slug}
                            className="w-24 h-14 object-cover rounded-lg border border-gray-200 hover:opacity-80 hover:shadow-md transition-all"
                          />
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleReanalyze(r.url)}
                          disabled={reanalyzingUrls.has(r.url)}
                          title="다시 측정"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {reanalyzingUrls.has(r.url) ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </button>
                        {r.logs && r.logs.length > 0 && (
                          <button
                            onClick={() => setLogModal({ open: true, title: r.slug, logs: r.logs || [] })}
                            title="분석 로그 보기"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Screenshot Modal */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setModalImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={modalImage}
              alt="Screenshot"
              className="max-w-[90vw] max-h-[90vh] rounded shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setModalImage(null)}
              className="absolute -top-4 -right-4 w-10 h-10 bg-white text-gray-900 rounded-full shadow-lg flex items-center justify-center font-bold text-lg hover:bg-gray-100 transition-colors"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Log Drawer */}
      {logModal.open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex justify-end"
          onClick={() => setLogModal({ open: false, title: '', logs: [] })}
        >
          <div
            className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">분석 로그</h3>
                <p className="text-sm text-gray-500">{logModal.title}</p>
              </div>
              <button
                onClick={() => setLogModal({ open: false, title: '', logs: [] })}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs space-y-1.5">
                {logModal.logs.map((log, i) => (
                  <div key={i} className="text-gray-300 break-all">
                    <span className="text-gray-500 mr-2 tabular-nums">{String(i + 1).padStart(3, '0')}</span>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
