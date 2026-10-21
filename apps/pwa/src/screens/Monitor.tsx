// Monitoring page (Prosit 2 C4). Signed-in team only; reads results through Nana Yaw's RPCs.
// Numbers only: no images, names or patient IDs ever reach this page.
import { useEffect, useMemo, useState } from 'react';
import { summarize, toCsv, type DriftStat, type Reference } from '../lib/monitor';
import { loadInferences, type InferenceRow } from '../lib/records';
import { t, type StringKey } from '../strings';
import { Mark } from '../ui/icons';

const fmt = (v: number | null, d = 2) => (v == null ? '–' : v.toFixed(d));

export function Monitor({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<InferenceRow[] | null | 'loading'>('loading');
  const [ref, setRef] = useState<Reference | null>(null);

  useEffect(() => {
    void loadInferences(100).then(setRows);
    fetch('/config/reference.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setRef).catch(() => setRef(null));
  }, []);

  const s = useMemo(() => (Array.isArray(rows) ? summarize(rows, ref) : null), [rows, ref]);
  const max = s ? Math.max(1, ...s.scoreHist.map((v) => v / Math.max(1, s.total - s.qualityFailed)), ...(s.refHist ? s.refHist.map((v) => v / s.refHist!.reduce((a, b) => a + b, 0)) : [])) : 1;

  function download() {
    if (!Array.isArray(rows)) return;
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `triagelens-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const scoredN = s ? s.total - s.qualityFailed : 0;
  const refN = s?.refHist ? s.refHist.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="page">
      <div className="wrap">
        <header className="page-head" style={{ alignItems: 'center' }}>
          <span className="brand"><Mark />{t('app_name')} {t('monitor_link').toLowerCase()}</span>
          <button className="link" type="button" onClick={onBack}>{t('back')}</button>
        </header>
        <div className="page-head">
          <h1 className="page-title">{t('monitor_title')}</h1>
          <button className="btn btn-primary" type="button" onClick={download} disabled={!s || !s.total} style={{ minHeight: 48, fontSize: 15 }}>{t('download_csv')}</button>
        </div>

        {rows === 'loading' && <p className="lead" role="status">{t('monitor_loading')}</p>}
        {rows === null && <p className="alert" role="alert">{t('monitor_failed')}</p>}

        {s && (
          <>
            <dl className="kpis">
              <div><dt>{t('kpi_screenings')}</dt><dd className="value num">{s.total}</dd><dd className="small">{t('kpi_screenings_note')}</dd></div>
              <div><dt>{t('kpi_quality')}</dt><dd className="value num">{s.total ? `${Math.round((100 * s.qualityFailed) / s.total)}%` : '–'}</dd><dd className="small">{t('kpi_quality_note')}</dd></div>
              <div><dt>{t('kpi_latency')}</dt><dd className="value num">{s.latencyP95 == null ? '–' : `${(s.latencyP95 / 1000).toFixed(1)} s`}</dd><dd className="small">{t('kpi_latency_note')}</dd></div>
              <div><dt>{t('kpi_mismatch')}</dt><dd className="value num">{s.mismatches}</dd><dd className="small">{t('kpi_mismatch_note')}</dd></div>
              <div><dt>{t('kpi_last')}</dt><dd className="value num">{s.last ? new Date(s.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'}</dd><dd className="small">{t('kpi_last_note')}</dd></div>
            </dl>

            <div className="grid2">
              <section className="card wide">
                <h2>{t('score_title')}</h2>
                {!s.refHist && <p className="small">{t('score_ref_pending')}</p>}
                <div className="hist" role="img" aria-label={t('score_title')}>
                  {s.scoreHist.map((v, i) => (
                    <div key={i}>
                      <span className="bar-live" style={{ height: `${(100 * (scoredN ? v / scoredN : 0)) / max}%` }} />
                      {s.refHist && <span className="bar-ref" style={{ height: `${(100 * (refN ? s.refHist[i] / refN : 0)) / max}%` }} />}
                    </div>
                  ))}
                </div>
                <div className="small num" style={{ display: 'flex', justifyContent: 'space-between' }}><span>0</span><span>1</span></div>
                <div className="legend">
                  <span><i className="swatch bar-live" />{t('score_live')}</span>
                  {s.refHist && <span><i className="swatch bar-ref" />{t('score_ref')}</span>}
                </div>
              </section>

              <section className="card">
                <h2>{t('drift_title')}</h2>
                {s.drift.every((d) => d.psi === null) && <p className="small">{t('drift_pending')}</p>}
                {s.drift.map((d) => (
                  <div key={d.stat} className="stack" style={{ gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                      <span>{t(`drift_${d.stat}` as StringKey)}</span>
                      <span className="num muted">{d.psi != null ? `PSI ${fmt(d.psi)}` : `median ${fmt(d.median, d.stat === 'width' ? 0 : 3)}`}</span>
                    </div>
                    {d.psi != null && (
                      <div className="track"><div className="fill" style={{ width: `${Math.min(100, (d.psi / 0.4) * 100)}%` }} /><div className="mark" /></div>
                    )}
                    <span className="small">{t(`drift_${d.stat}_why` as StringKey)}</span>
                  </div>
                ))}
                <span className="small">{t('drift_formula')}</span>
              </section>
            </div>

            <div className="grid2">
              <section className="card">
                <h2>{t('zone_mix_title')}</h2>
                <div className="mix" aria-hidden="true">
                  {(['refer_now', 'unsure', 'low_risk'] as const).map((z) => (
                    <div key={z} style={{ width: `${s.total ? (100 * s.zones[z]) / s.total : 0}%`, background: `var(--zone-${z === 'refer_now' ? 'refer' : z === 'unsure' ? 'unsure' : 'low'})` }} />
                  ))}
                </div>
                <dl className="mix-grid num">
                  <div><dt className="small">{t('zone_refer_now')}</dt><dd>{s.zones.refer_now}</dd></div>
                  <div><dt className="small">{t('zone_unsure')}</dt><dd>{s.zones.unsure}</dd></div>
                  <div><dt className="small">{t('zone_low_risk')}</dt><dd>{s.zones.low_risk}</dd></div>
                  <div><dt className="small">{t('no_result')}</dt><dd>{s.zones.retake}</dd></div>
                </dl>
                <span className="small">{t('zone_mix_note')}</span>
              </section>
              <section className="card">
                <h2>{t('versions_title')}</h2>
                <dl className="kv">
                  <div><dt>{t('v_model')}</dt><dd>{s.versions.model.join(', ') || '–'}</dd></div>
                  <div><dt>{t('v_thresholds')}</dt><dd>{s.versions.thresholds.join(', ') || '–'}</dd></div>
                  <div><dt>{t('v_preprocess')}</dt><dd>{s.versions.preprocess.join(', ') || '–'}</dd></div>
                  <div><dt>{t('v_build')}</dt><dd>{s.versions.build.join(', ') || '–'}</dd></div>
                </dl>
              </section>
            </div>

            <section className="stack">
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>{t('latest_title')}</h2>
              <div className="table-box">
                <table className="num">
                  <thead><tr>
                    {(['col_time', 'col_quality', 'col_zone'] as const).map((k) => <th key={k}>{t(k)}</th>)}
                    {(['col_bin', 'col_aspect', 'col_brightness', 'col_edges', 'col_time_ms'] as const).map((k) => <th key={k} className="right">{t(k)}</th>)}
                  </tr></thead>
                  <tbody>
                    {Array.isArray(rows) && rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ padding: '28px 8px' }}>{t('monitor_none')}</td></tr>}
                    {Array.isArray(rows) && rows.slice(0, 10).map((r) => {
                      const st = r.outputs.input_stats ?? {};
                      const p = r.outputs.tb_probability;
                      return (
                        <tr key={r.id}>
                          <td>{new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td>{r.quality_scores.passed ? t('passed') : `${t('failed')}: ${r.quality_scores.reason ?? ''}`}</td>
                          <td>{r.zone === 'retake' ? t('no_result') : t(`zone_${r.zone}` as StringKey)}</td>
                          <td className="right">{typeof p === 'number' ? `${(Math.min(9, Math.floor(p * 10)) / 10).toFixed(1)}–${(Math.min(9, Math.floor(p * 10)) / 10 + 0.1).toFixed(1)}` : '–'}</td>
                          <td className="right">{fmt(st.aspect_ratio ?? null, 3)}</td>
                          <td className="right">{fmt(st.mean_brightness ?? null, 0)}</td>
                          <td className="right">{fmt(st.edge_energy ?? null, 3)}</td>
                          <td className="right">{`${Math.round(r.latency_ms)} ms`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export type { DriftStat };
