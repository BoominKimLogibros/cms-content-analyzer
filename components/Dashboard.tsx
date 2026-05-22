'use client';

import { useEffect, useState, useMemo } from 'react';
import { AnalysisResult, UrlItem, UrlListResponse, AnalyzeResponse } from '@/types';

function estimateDuration(urlCount: number): string {
  if (urlCount <= 0) return '0초';
  const batches = Math.ceil(urlCount / 5);
  const seconds = batches * 3;
  if (seconds < 60) return `약 ${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `약 ${minutes}분 ${rem}초` : `약 ${minutes}분`;
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
    } catch (err: any) {
      setMessage(`동기화 오류: ${err.message}`);
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
    try {
      const urls = checkedItems.map((u) => u.url);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data: AnalyzeResponse = await res.json();
      if (data.success) {
        setResults(data.results);
        setMessage(
          `${data.totalCount}개 분석 완료 (성공 ${data.successCount}개, 실패 ${data.failCount}개)`
        );
      } else {
        setMessage(`분석 실패: ${data.message}`);
      }
    } catch (err: any) {
      setMessage(`분석 오류: ${err.message}`);
    } finally {
      setLoadingAnalyze(false);
    }
  }

  const estimatedTime = useMemo(() => estimateDuration(checkedCount), [checkedCount]);

  const hasUrls = totalCount > 0;
  const allChecked = hasUrls && urlItems.every((u) => u.checked);

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
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title={item.url}
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
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4" title="개선이 시급한 순서 (점수 낮은 순)">우선순위</th>
                  <th className="py-3 px-4">파일명</th>
                  <th className="py-3 px-4">URL</th>
                  <th className="py-3 px-4" title="페이지 로드 이벤트부터 LOAD_COMPLETE(또는 폴백)까지 걸린 시간">로딩 시간</th>
                  <th className="py-3 px-4" title="Chromium V8 JS Heap 사용량 (performance.memory.usedJSHeapSize). 브라우저 전체 Heap이므로 컨텐츠 간 차이가 적을 수 있습니다.">JS 메모리 사용량</th>
                  <th className="py-3 px-4" title="CDP Network.loadingFinished의 encodedDataLength 합계. 페이지 로드 중 전송된 모든 리소스의 누적 바이트입니다.">리소스 다운로드 크기</th>
                  <th className="py-3 px-4" title="로딩 시간 / 메모리 / 다운로드 크기를 동일 비중으로 정규화한 평균 (0~100). 낮을수록 개선 필요.">성능 점수</th>
                  <th className="py-3 px-4">상태</th>
                  <th className="py-3 px-4">스크린샷</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={`${r.url}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{idx + 1}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 font-medium">{r.slug}</td>
                    <td className="py-3 px-4 text-sm text-gray-500 max-w-xs truncate">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title={r.url}
                      >
                        {r.url}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 tabular-nums">
                      {r.status === 'success' ? `${r.loadTime.toFixed(2)}초` : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 tabular-nums">
                      {r.status === 'success' ? `${r.memory.toFixed(1)} MB` : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 tabular-nums">
                      {r.status === 'success' ? `${r.size.toFixed(1)} MB` : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm font-bold tabular-nums">
                      {r.status === 'success' ? (
                        <span className={r.score < 50 ? 'text-red-600' : r.score < 75 ? 'text-amber-600' : 'text-emerald-600'}>
                          {r.score.toFixed(1)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {r.status === 'error' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          실패
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                          정상
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {r.screenshotPath ? (
                        <button
                          onClick={() => setModalImage(r.screenshotPath)}
                          className="p-0 border-0 bg-transparent cursor-pointer"
                        >
                          <img
                            src={r.screenshotPath}
                            alt={r.slug}
                            className="w-32 h-20 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
                          />
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
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
    </div>
  );
}
