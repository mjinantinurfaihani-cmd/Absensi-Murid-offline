import React, { useEffect, useState, useRef } from 'react';

type Metrics = {
  successful_requests?: number;
  retry_attempts?: number;
  failed_requests?: number;
  token_fetch_failures?: number;
  [key: string]: any;
};

export default function InfobipMetrics(): React.ReactElement {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevRef = useRef<Metrics | null>(null);
  const [increasedKeys, setIncreasedKeys] = useState<string[]>([]);
  const clearPulseTimeout = useRef<number | null>(null);
  const [histories, setHistories] = useState<Record<string, number[]>>({});
  const HISTORY_MAX = 6;

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/infobip/metrics', { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // detect increases compared to previous metrics
      const increases: string[] = [];
      const nextHistories: Record<string, number[]> = { ...histories };

      for (const [k, v] of Object.entries(data)) {
        const currVal = Number(v);
        // update history
        const h = (nextHistories[k] || []).slice();
        if (!Number.isNaN(currVal)) {
          h.push(currVal);
          if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
          nextHistories[k] = h;
        }

        const prevVal = Number(prevRef.current?.[k]);
        if (!Number.isNaN(currVal) && !Number.isNaN(prevVal) && currVal > prevVal) {
          increases.push(k);
        }
      }

      // update metrics, history and previous snapshot
      setHistories(nextHistories);
      setMetrics(data);
      prevRef.current = data;

      if (increases.length) {
        setIncreasedKeys(increases);
        // clear pulse flags after animation completes
        if (clearPulseTimeout.current) window.clearTimeout(clearPulseTimeout.current);
        clearPulseTimeout.current = window.setTimeout(() => setIncreasedKeys([]), 1200);
      } else {
        setIncreasedKeys([]);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMetrics();
  }, []);

  const formatKey = (k: string) => {
    return k.replace(/_/g, ' ').replace(/(^|\s)\S/g, s => s.toUpperCase());
  };

  const getColor = (k: string) => {
    switch (k) {
      case 'successful_requests':
        return 'var(--green)';
      case 'retry_attempts':
        return 'var(--blue)';
      case 'failed_requests':
        return '#dc2626';
      case 'token_fetch_failures':
        return '#f59e0b';
      default:
        return 'var(--muted)';
    }
  };

  const hexToRgba = (hex: string, alpha = 0.12) => {
    // support #rgb, #rrggbb
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getIcon = (k: string) => {
    // simple inline SVGs using currentColor
    switch (k) {
      case 'successful_requests':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.06" />
            <path d="M9 12.5l1.8 1.8L15 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        );
      case 'retry_attempts':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 12a9 9 0 10-2.3 5.7L21 12z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        );
      case 'failed_requests':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.06" />
            <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        );
      case 'token_fetch_failures':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="7" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <path d="M7 11h10M12 14v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
        );
    }
  };

  return (
    <div className="infobip-metrics">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button type="button" className="primary" onClick={() => void fetchMetrics()} disabled={loading}>
          {loading ? 'Memuat...' : 'Segarkan'}
        </button>
        <button type="button" onClick={() => { setMetrics(null); setError(null); prevRef.current = null; setIncreasedKeys([]); if (clearPulseTimeout.current) { window.clearTimeout(clearPulseTimeout.current); clearPulseTimeout.current = null; } }}>
          Kosongkan tampilan
        </button>
      </div>

      {error && <div className="error">Gagal memuat metrik: {error}</div>}

      {metrics ? (
        <ul className="metrics-list">
          {Object.entries(metrics).map(([k, v]) => (
            <li key={k} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className={`metric-icon ${increasedKeys.includes(k) ? 'metric-pulse' : ''}`}
                            aria-hidden
                            style={{
                              color: getColor(k),
                              background: (increasedKeys.includes(k) ? (hexToRgba(String(getColor(k)), 0.14) || undefined) : undefined)
                            }}
                          >
                            {getIcon(k)}
                          </span>
                          <span style={{ color: '#333' }}>{formatKey(k)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                          <strong className={increasedKeys.includes(k) ? 'metric-value metric-value-pulse' : 'metric-value'}>{String(v)}</strong>
                          {prevRef.current && prevRef.current[k] !== undefined ? (
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                              {(() => {
                                const prev = Number(prevRef.current?.[k]);
                                const curr = Number(v);
                                if (Number.isNaN(prev) || Number.isNaN(curr)) return null;
                                const diff = curr - prev;
                                if (diff === 0) return <span>±0</span>;
                                return <span style={{ color: diff > 0 ? 'var(--green)' : '#dc2626' }}>{diff > 0 ? `+${diff}` : String(diff)}</span>;
                              })()}
                            </div>
                          ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !loading && <p className="muted">Metrik belum tersedia. Pastikan server sedang berjalan dan endpoint /api/infobip/metrics aktif.</p>
      )}
    </div>
  );
}
