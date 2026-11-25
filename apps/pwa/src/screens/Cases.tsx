// Saved cases on this phone (E8-06, FR-07): a list with search by case code, and one case
// with its result, versions and notes. Zones keep colour plus icon plus text (TRD 7.3);
// raw scores are never shown here. Phone: list, then the case on its own screen.
// Desktop: list and case side by side.
import { useEffect, useState } from 'react';
import { countCases, findByCode, getCase, listCases, NOTES_MAX, PAGE_SIZE, setNotes, type LocalCase } from '../lib/caseStore';
import { t, type StringKey } from '../strings';
import { AlertCircle, Camera, Folder, Search, ZoneIcon } from '../ui/icons';
import { Empty, Facts, TopBar, useWide, ZoneRow } from '../ui/kit';

const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const whenLong = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

const zoneOf = (c: LocalCase) => (c.status === 'result' && c.result && c.result.zone !== 'retake' ? c.result.zone : null);
const statusKey = (c: LocalCase) => (c.status === 'result' ? 'error' : c.status);

/** One row's state: the zone's icon and words in its ink (colour plus icon plus text), no pill. */
function RowState({ c }: { c: LocalCase }) {
  const z = zoneOf(c);
  if (z) return <span className={`case-state case-${z}`}><ZoneIcon zone={z} size={16} />{t(`zone_${z}` as StringKey)}</span>;
  return <span className="case-state">{t(`status_${statusKey(c)}` as StringKey)}</span>;
}

function CaseView({ db, id, onSaved }: { db: IDBDatabase; id: string; onSaved: (c: LocalCase) => void }) {
  const [c, setC] = useState<LocalCase | null | undefined>(undefined);
  const [notes, setNotesText] = useState('');
  const [saved, setSaved] = useState<'idle' | 'ok' | 'failed'>('idle');

  useEffect(() => {
    let live = true;
    void getCase(db, id).then((found) => { if (live) { setC(found ?? null); setNotesText(found?.notes ?? ''); } });
    return () => { live = false; };
  }, [db, id]);

  if (c === undefined) return <p className="t-small" role="status">{t('cases_loading')}</p>;
  if (c === null) return <Empty tone="problem" role="alert" icon={<AlertCircle size={26} />} title={t('case_missing_title')} body={t('case_missing_body')} />;

  const z = zoneOf(c);
  const save = async () => {
    try { const next = await setNotes(db, c.id, notes); setC(next); onSaved(next); setSaved('ok'); } catch { setSaved('failed'); }
  };

  return (
    <>
      <div className="stack-tight">
        <p className="code-xl">{c.code}</p>
        <p className="t-small num">{whenLong.format(new Date(c.createdAt))}</p>
      </div>
      {z ? (
        <section className="stack-tight" aria-label={t(`zone_${z}` as StringKey)}>
          <ZoneRow zone={z} word={t(`zone_${z}` as StringKey)} />
          <p className="t-lead" style={{ color: 'var(--ink)' }}>{t(`message_${z}` as StringKey)}</p>
        </section>
      ) : (
        <section className="cloud">
          <h2 className="t-title">{t(`status_${statusKey(c)}` as StringKey)}</h2>
          <p className="t-small">{t(`case_no_result_${statusKey(c)}` as StringKey)}</p>
          {c.status === 'retake' && c.result?.quality.reason && <p className="t-strong">{t(`retake_title_${c.result.quality.reason}` as StringKey)}</p>}
        </section>
      )}
      <Facts rows={[
        [t('case_age'), c.ageBand],
        ...(c.result ? [[t('case_quality'), t(c.result.quality.passed ? 'passed' : 'failed')] as [string, string]] : []),
      ]} />
      <label className="field">{t('notes_label')}
        <textarea className="input" rows={4} maxLength={NOTES_MAX} value={notes} style={{ padding: 14, minHeight: 112, resize: 'vertical' }}
          onChange={(e) => { setNotesText(e.target.value); setSaved('idle'); }} aria-describedby="case-notes-hint" />
        <span className="hint" id="case-notes-hint">{t('notes_hint')}</span>
      </label>
      <button className="btn btn-ghost btn-full" type="button" style={{ background: '#fff', maxWidth: 440 }} disabled={notes === c.notes} onClick={() => void save()}>{t('notes_save')}</button>
      {saved !== 'idle' && <p className="t-small" role="status">{t(saved === 'ok' ? 'notes_saved' : 'notes_failed')}</p>}
      <p className="remind" style={{ textAlign: 'left' }}>{t('reminder')}</p>
      {c.result && <p className="t-cap">{t('versions', { model: c.result.modelVersion, thresholds: c.result.thresholdsVersion, preprocess: c.result.preprocessVersion })}</p>}
    </>
  );
}

export function Cases({ db, onScreen, dock }: { db: IDBDatabase | null | 'unavailable'; onScreen: () => void; dock?: React.ReactNode }) {
  const wide = useWide();
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<LocalCase[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!db || db === 'unavailable') return;
    let live = true;
    const q = query.trim();
    void Promise.all([q ? findByCode(db, q) : listCases(db), countCases(db)]).then(([list, n]) => {
      if (!live) return;
      setCases(list); setTotal(n); setMore(!q && list.length === PAGE_SIZE);
    });
    return () => { live = false; };
  }, [db, query]);

  const older = async () => {
    if (!db || db === 'unavailable' || !cases?.length) return;
    const next = await listCases(db, cases[cases.length - 1].createdAt);
    setCases([...cases, ...next]); setMore(next.length === PAGE_SIZE);
  };
  const onSaved = (c: LocalCase) => setCases((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? l);

  // Phone: a chosen case takes the whole screen.
  if (open && !wide && db && db !== 'unavailable') {
    const code = cases?.find((c) => c.id === open)?.code ?? '';
    return (
      <main className="screen">
        <TopBar title={t('case_title', { code })} onBack={() => setOpen(null)} />
        <div className="body pane" style={{ gap: 20, paddingBottom: 48 }}><CaseView db={db} id={open} onSaved={onSaved} /></div>
      </main>
    );
  }

  const q = query.trim();
  const list = db === 'unavailable' ? (
    <Empty tone="problem" role="alert" icon={<AlertCircle size={26} />} title={t('cases_unavailable_title')} body={t('cases_unavailable')} />
  ) : (
    <>
      {(total > 0 || q) && (
        <label className="search">
          <span className="sr">{t('cases_search_label')}</span>
          <Search size={18} color="#60606c" />
          <input className="input code" type="search" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="TL-7K3MPQ"
            value={query} onChange={(e) => setQuery(e.target.value)} aria-describedby="case-search-hint" />
          <span className="sr" id="case-search-hint">{t('cases_search_hint')}</span>
        </label>
      )}
      {cases === null ? (
        <p className="t-small" role="status">{t('cases_loading')}</p>
      ) : cases.length === 0 ? (
        q ? (
          <Empty icon={<Search size={26} />} title={t('cases_no_match_title')} body={t('cases_no_match', { q: q.toUpperCase() })}
            action={<button className="btn btn-ghost" type="button" style={{ background: '#fff' }} onClick={() => setQuery('')}>{t('cases_clear')}</button>} />
        ) : (
          <Empty icon={<Folder size={26} />} title={t('cases_empty_title')} body={t('cases_empty')}
            action={<button className="btn btn-primary" type="button" onClick={onScreen}><Camera />{t('cases_start')}</button>} />
        )
      ) : (
        <>
          {!q && <p className="t-cap" role="status">{total === 1 ? t('cases_count_one') : t('cases_count', { n: total })}</p>}
          <ul className="list" aria-label={t('cases_title')}>
            {cases.map((c) => (
              <li key={c.id}>
                <button className="item" type="button" aria-current={wide && open === c.id ? true : undefined} onClick={() => setOpen(c.id)}>
                  <span className="row"><span className="code">{c.code}</span><RowState c={c} /></span>
                  <span className="t-small num">{when.format(new Date(c.createdAt))}, {c.ageBand}</span>
                </button>
              </li>
            ))}
          </ul>
          {more && <button className="btn btn-ghost btn-full" type="button" style={{ background: '#fff' }} onClick={() => void older()}>{t('cases_more')}</button>}
        </>
      )}
    </>
  );

  return (
    <main className="screen">
      <TopBar title={t('cases_title')} big />
      <div className="body has-dock pane">
        <div className="split">
          <div className="split-list">{list}</div>
          {wide && db && db !== 'unavailable' && (cases?.length ?? 0) > 0 && (
            <section className="split-detail" aria-live="polite">
              {open ? <CaseView key={open} db={db} id={open} onSaved={onSaved} />
                : <Empty icon={<Folder size={26} />} title={t('cases_pick_title')} body={t('cases_pick_body')} />}
            </section>
          )}
        </div>
      </div>
      {dock}
    </main>
  );
}
