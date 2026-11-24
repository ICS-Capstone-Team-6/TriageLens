// Saved cases on this phone (E8-06, FR-07): a list with search by case code, and one case
// with its result, versions and notes. Zones keep colour plus icon plus text (TRD 7.3);
// raw scores are never shown here. Strings live in strings/en.json.
import { useEffect, useState } from 'react';
import { countCases, findByCode, getCase, listCases, NOTES_MAX, PAGE_SIZE, setNotes, type LocalCase } from '../lib/caseStore';
import { t, type StringKey } from '../strings';
import { Back, ZoneIcon } from '../ui/icons';

const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const whenLong = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Top bar. On the list the title is the screen's h1; on a case the zone card holds the h1. */
function Bar({ title, onBack, heading = false }: { title: string; onBack: () => void; heading?: boolean }) {
  return (
    <header className="bar">
      <button className="btn btn-round" type="button" aria-label={t('back')} onClick={onBack}><Back /></button>
      {heading ? <h1 className="bar-title">{title}</h1> : <span className="bar-title">{title}</span>}
    </header>
  );
}

/** Zone with its colour, icon and text; a case with no zone gets a plain grey label. */
function CaseState({ c }: { c: LocalCase }) {
  const zone = c.status === 'result' && c.result && c.result.zone !== 'retake' ? c.result.zone : null;
  if (zone) {
    return (
      <span className={`pill pill-${zone}`}>
        <ZoneIcon zone={zone} />
        {t(`zone_${zone}` as StringKey)}
      </span>
    );
  }
  return <span className="pill pill-none">{t(`status_${c.status === 'result' ? 'error' : c.status}` as StringKey)}</span>;
}

interface LogProps {
  db: IDBDatabase | null | 'unavailable';
  onBack: () => void;
  onOpen: (id: string) => void;
}

export function CaseLog({ db, onBack, onOpen }: LogProps) {
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<LocalCase[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!db || db === 'unavailable') return;
    let live = true;
    const q = query.trim();
    const load = q ? findByCode(db, q) : listCases(db);
    void Promise.all([load, countCases(db)]).then(([list, n]) => {
      if (!live) return;
      setCases(list);
      setTotal(n);
      setMore(!q && list.length === PAGE_SIZE);
    });
    return () => { live = false; };
  }, [db, query]);

  const older = async () => {
    if (!db || db === 'unavailable' || !cases?.length) return;
    const next = await listCases(db, cases[cases.length - 1].createdAt);
    setCases([...cases, ...next]);
    setMore(next.length === PAGE_SIZE);
  };

  return (
    <main className="screen">
      <Bar title={t('cases_title')} onBack={onBack} heading />
      {db === 'unavailable' ? (
        <p className="panel lead" role="alert">{t('cases_unavailable')}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="case-search" className="strong">{t('cases_search_label')}</label>
            <input
              id="case-search"
              type="search"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="TL-7K3MPQ"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-describedby="case-search-hint"
            />
            <span id="case-search-hint" className="small">{t('cases_search_hint')}</span>
          </div>

          {cases === null ? (
            <p className="muted" role="status">{t('cases_loading')}</p>
          ) : cases.length === 0 ? (
            <p className="panel lead" role="status">
              {query.trim() ? t('cases_no_match', { q: query.trim().toUpperCase() }) : t('cases_empty')}
            </p>
          ) : (
            <>
              {!query.trim() && (
                <p className="small" role="status">{total === 1 ? t('cases_count_one') : t('cases_count', { n: total })}</p>
              )}
              <ul className="case-list">
                {cases.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="case-row" onClick={() => onOpen(c.id)}>
                      <span className="case-main">
                        <span className="case-code num">{c.code}</span>
                        <span className="small num">{when.format(new Date(c.createdAt))} · {c.ageBand}</span>
                      </span>
                      <CaseState c={c} />
                    </button>
                  </li>
                ))}
              </ul>
              {more && <button className="btn btn-secondary" type="button" onClick={() => void older()}>{t('cases_more')}</button>}
            </>
          )}
        </>
      )}
    </main>
  );
}

interface DetailProps {
  db: IDBDatabase;
  id: string;
  onBack: () => void;
}

export function CaseDetail({ db, id, onBack }: DetailProps) {
  const [c, setC] = useState<LocalCase | null | undefined>(undefined);
  const [notes, setNotesText] = useState('');
  const [saved, setSaved] = useState<'idle' | 'ok' | 'failed'>('idle');

  useEffect(() => {
    void getCase(db, id).then((found) => {
      setC(found ?? null);
      setNotesText(found?.notes ?? '');
    });
  }, [db, id]);

  if (c === undefined) return <main className="screen"><Bar title={t('cases_title')} onBack={onBack} /></main>;
  if (c === null) return <main className="screen"><Bar title={t('cases_title')} onBack={onBack} /><p className="panel lead">{t('error_body')}</p></main>;

  const zone = c.status === 'result' && c.result && c.result.zone !== 'retake' ? c.result.zone : null;
  const save = async () => {
    try {
      setC(await setNotes(db, c.id, notes));
      setSaved('ok');
    } catch {
      setSaved('failed');
    }
  };

  return (
    <main className="screen">
      <Bar title={t('case_title', { code: c.code })} onBack={onBack} />
      {zone ? (
        <section className={`zone zone-${zone}`} aria-labelledby="case-zone">
          <div className="zone-head">
            <ZoneIcon zone={zone} />
            <h1 className="zone-name" id="case-zone">{t(`zone_${zone}` as StringKey)}</h1>
          </div>
          <p className="zone-message">{t(`message_${zone}` as StringKey)}</p>
        </section>
      ) : (
        <section className="panel panel-big">
          <h1 className="h1">{t(`status_${c.status === 'result' ? 'error' : c.status}` as StringKey)}</h1>
          <p className="lead">{t(`case_no_result_${c.status === 'result' ? 'error' : c.status}` as StringKey)}</p>
          {c.status === 'retake' && c.result?.quality.reason && (
            <p className="lead strong">{t(`retake_title_${c.result.quality.reason}` as StringKey)}</p>
          )}
        </section>
      )}

      <dl className="conditions">
        <div><dt>{t('case_time')}</dt><dd className="num">{whenLong.format(new Date(c.createdAt))}</dd></div>
        <div><dt>{t('case_age')}</dt><dd>{c.ageBand}</dd></div>
        {c.result && <div><dt>{t('case_quality')}</dt><dd>{t(c.result.quality.passed ? 'passed' : 'failed')}</dd></div>}
      </dl>

      <div className="field">
        <label htmlFor="case-notes" className="strong">{t('notes_label')}</label>
        <textarea
          id="case-notes"
          rows={4}
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(e) => { setNotesText(e.target.value); setSaved('idle'); }}
          aria-describedby="case-notes-hint"
        />
        <span id="case-notes-hint" className="small">{t('notes_hint')}</span>
      </div>
      <button className="btn btn-secondary" type="button" disabled={notes === c.notes} onClick={() => void save()}>{t('notes_save')}</button>
      {saved !== 'idle' && <p className="small center" role="status">{t(saved === 'ok' ? 'notes_saved' : 'notes_failed')}</p>}

      <div className="spacer" />
      <p className="lead strong center">{t('reminder')}</p>
      {c.result && (
        <p className="versions">
          {t('versions', { model: c.result.modelVersion, thresholds: c.result.thresholdsVersion, preprocess: c.result.preprocessVersion })}
        </p>
      )}
    </main>
  );
}
