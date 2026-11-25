// Refer to a facility (E10-03, E10-06; ADR-22, ADR-28). The worker picks one of the
// nearest facilities that has the services this result needs; the app never picks for
// them (hazard H20). Distances are straight-line estimates (H17); services not confirmed
// recently say "Check by phone first" (H16). Then a slip shows the referral code.
import { useEffect, useMemo, useState } from 'react';
import { formatCode, toInitials, type CamForShare, type DirectoryCache, type ReferralDraft, type SentReferral, type ShareResult } from '../lib/referral/api';
import { distanceBand, distanceKm, matchFacilities, validPoint, type Facility, type Match, type Option, type Point } from '../lib/referral/match';
import { RULES_V1, type ServiceTag, type Urgency } from '../lib/referral/rules';
import { t, type StringKey } from '../strings';
import { Back } from '../ui/icons';
import { AmbulancePanel } from './Ambulance';
import type { AmbulanceDeps } from '../lib/referral/ambulance';

export interface ReferralDeps {
  loadDirectory: () => Promise<DirectoryCache | null>;
  ownFacilityId: () => Promise<string | null>;
  send: (d: ReferralDraft) => Promise<SentReferral | null>;
  shareImage: (referralId: string, file: Blob, cam: CamForShare | null, toFacility: string, ownFacility: string | null) => Promise<ShareResult>;
  canReceiveImages: (facilityId: string) => Promise<boolean>;
}

interface Props {
  zone: 'refer_now' | 'unsure';
  caseId: string | null; // null when the screening was not saved: cannot be sent yet
  image: Blob | null; // the screened image, kept in memory only; shared only with consent
  cam: CamForShare | null; // heatmap for the receiving clinician, when the model gives one
  deps: ReferralDeps;
  ambulance: AmbulanceDeps;
  versions: string;
  onBack: () => void;
  onDone: () => void;
}

type ImageState = 'none' | 'sending' | 'shared' | 'failed' | 'no_receiver_key';
type Step = { name: 'choose' } | { name: 'sending' } | { name: 'failed' } | { name: 'sent'; sent: SentReferral; to: Option; image: ImageState };

const svc = (tag: ServiceTag | string) => t(`service_${tag}` as StringKey);
const list = (tags: string[]) => tags.map(svc).join(', ');

function km(o: Option) {
  return o.distanceKm < 1 ? t('distance_under_1') : t('distance_km', { km: Math.round(o.distanceKm) });
}

function FacilityCard({ o, selected, onSelect }: { o: Option; selected: boolean; onSelect: () => void }) {
  const f = o.facility;
  return (
    <label className={`fac${selected ? ' fac-on' : ''}`}>
      <input type="radio" name="facility" checked={selected} onChange={onSelect} />
      <span className="fac-head">
        <span className="fac-name">{f.name}</span>
        <span className="small num">{km(o)}</span>
      </span>
      <span className="small">{[f.district, f.region].filter(Boolean).join(', ')}</span>
      <span className="small">
        {o.openNow === true ? t('open_now') : o.openNow === false ? t('closed_now') : t('hours_unknown')}
        {o.has.length > 0 && ` · ${t('has_services', { services: list(o.has) })}`}
      </span>
      {o.missing.length > 0 && <span className="small strong">{t('missing_services', { services: list(o.missing) })}</span>}
      {o.stale && (
        <span className="small strong">
          {o.confirmedDaysAgo === null ? t('services_never_confirmed') : t('services_stale', { days: o.confirmedDaysAgo })}
        </span>
      )}
      {f.phone && <a className="link fac-call" href={`tel:${f.phone}`}>{t('call_facility', { phone: f.phone })}</a>}
    </label>
  );
}

export function Referral({ zone, caseId, image, cam, deps, ambulance, versions, onBack, onDone }: Props) {
  const [consent, setConsent] = useState(false);
  const [receives, setReceives] = useState<Record<string, boolean>>({});
  const [directory, setDirectory] = useState<DirectoryCache | null | 'loading'>('loading');
  const [own, setOwn] = useState<string | null>(null);
  const [phoneHere, setPhoneHere] = useState<Point | null>(null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied'>('idle');
  const [showAll, setShowAll] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [initialsInput, setInitialsInput] = useState('');
  const [step, setStep] = useState<Step>({ name: 'choose' });
  // One id per referral attempt, so a retry after a dropped connection is a safe replay.
  const [referralId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let live = true;
    void Promise.all([deps.loadDirectory(), deps.ownFacilityId()]).then(([d, o]) => {
      if (!live) return;
      setDirectory(d);
      setOwn(o);
    });
    return () => { live = false; };
  }, [deps]);

  const facilities: Facility[] = directory && directory !== 'loading' ? directory.facilities : [];
  const ownFacility = facilities.find((f) => f.id === own) ?? null;
  // Default: distance from the worker's own clinic. The phone's location only if they ask.
  const here: Point | null = phoneHere ?? (ownFacility && validPoint(ownFacility) ? ownFacility : null);
  const now = useMemo(() => new Date(), []);
  const match: Match = useMemo(
    () => matchFacilities([{ condition: 'tb', zone }], facilities, here, now, RULES_V1, own ?? undefined),
    [zone, facilities, here, now, own],
  );
  const everyone: Option[] = useMemo(() => {
    const pool = facilities.filter((f) => f.id !== own);
    const opts: Option[] = pool.map((f) => {
      const d = here ? distanceKm(here, f) : 0;
      return {
        facility: f, distanceKm: d, distanceBand: distanceBand(d),
        has: [], missing: [], preferredHas: [], openNow: null, stale: false, confirmedDaysAgo: null,
      };
    });
    return here ? opts.sort((a, b) => a.distanceKm - b.distanceKm) : opts.sort((a, b) => a.facility.name.localeCompare(b.facility.name));
  }, [facilities, here, own]);

  const suggested: Option[] =
    match.kind === 'matches' ? match.options
      : match.kind === 'unfiltered' ? match.options.slice(0, 3)
        : match.kind === 'none_in_reach' ? [match.nearestPartial, match.nearestBeyondReach].filter((o): o is Option => o !== null)
          : [];
  const shown = showAll ? everyone : suggested;
  const pick = [...suggested, ...everyone].find((o) => o.facility.id === chosen) ?? null;
  const initials = toInitials(initialsInput);
  useEffect(() => {
    if (!chosen || chosen in receives) return;
    let live = true;
    void deps.canReceiveImages(chosen).then((ok) => { if (live) setReceives((m) => ({ ...m, [chosen]: ok })); });
    return () => { live = false; };
  }, [chosen, deps, receives]);
  const urgency: Urgency | null = match.kind === 'matches' || match.kind === 'none_in_reach' ? match.urgency : null;

  function locate() {
    if (!('geolocation' in navigator)) return setLocating('denied');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPhoneHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating('idle'); },
      () => setLocating('denied'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }

  async function send() {
    if (!pick || !caseId || !RULES_V1) return;
    setStep({ name: 'sending' });
    const sent = await deps.send({
      id: referralId, caseId, toFacility: pick.facility.id, conditions: ['tb'], urgency,
      rulesVersion: RULES_V1.version, distanceBand: here ? pick.distanceBand : null, initials,
    });
    if (!sent) return setStep({ name: 'failed' });
    const withImage = consent && image !== null && receives[pick.facility.id] === true;
    setStep({ name: 'sent', sent, to: pick, image: withImage ? 'sending' : 'none' });
    if (withImage) void share(sent, pick);
  }

  async function share(sent: SentReferral, to: Option) {
    if (!image) return;
    setStep({ name: 'sent', sent, to, image: 'sending' });
    const res = await deps.shareImage(sent.id, image, cam, to.facility.id, own);
    setStep({ name: 'sent', sent, to, image: res === 'shared' ? 'shared' : res === 'no_receiver_key' ? 'no_receiver_key' : 'failed' });
  }

  const bar = (title: string, back: () => void) => (
    <header className="bar">
      <button className="btn btn-round" type="button" aria-label={t('back')} onClick={back}><Back /></button>
      <span className="bar-title">{title}</span>
    </header>
  );

  if (step.name === 'sent') {
    const f = step.to.facility;
    return (
      <main className="screen">
        {bar(t('slip_header'), onDone)}
        <section className="panel panel-big" role="status">
          <h1 className="h1">{t('slip_title')}</h1>
          <p className="slip-code num" aria-label={t('slip_code_label', { code: step.sent.code.split('').join(' ') })}>
            {formatCode(step.sent.code, step.sent.initials)}
          </p>
          <p className="lead">{t('slip_give_code')}</p>
        </section>
        <dl className="kv">
          <div><dt>{t('slip_to')}</dt><dd>{f.name}</dd></div>
          <div><dt>{t('slip_result')}</dt><dd>{t(`zone_${zone}` as StringKey)}</dd></div>
          {urgency && <div><dt>{t('slip_when')}</dt><dd>{t(`urgency_${urgency}` as StringKey)}</dd></div>}
          <div><dt>{t('slip_distance')}</dt><dd>{km(step.to)}</dd></div>
          <div><dt>{t('slip_image')}</dt><dd role="status">{t(`image_${step.image}` as StringKey)}</dd></div>
        </dl>
        {step.image === 'failed' && (
          <button className="btn btn-secondary" type="button" onClick={() => void share(step.sent, step.to)}>{t('image_retry')}</button>
        )}
        <AmbulancePanel referralId={step.sent.id} toName={f.name} toPhone={f.phone} deps={ambulance} />
        <div className="spacer" />
        <p className="lead strong center">{t('reminder')}</p>
        <button className="btn btn-primary" type="button" onClick={onDone}>{t('done_new')}</button>
        <p className="versions">{versions}</p>
      </main>
    );
  }

  return (
    <main className="screen">
      {bar(t('refer_header'), onBack)}
      <div className="stack">
        <h1 className="h1">{t('refer_title')}</h1>
        {match.kind === 'matches' && <p className="lead">{t('refer_lead', { services: list(match.needs) })}</p>}
        {RULES_V1?.status === 'demo_draft' && <p className="small">{t('rules_demo_draft')}</p>}
      </div>

      {!caseId && <p className="alert" role="alert">{t('refer_not_saved')}</p>}
      {directory === 'loading' && <p className="muted" role="status">{t('refer_loading')}</p>}
      {directory === null && <p className="alert" role="alert">{t('refer_no_directory')}</p>}

      {directory && directory !== 'loading' && (
        <>
          <p className="small">
            {phoneHere ? t('distance_from_phone') : here ? t('distance_from_clinic') : t('location_unknown')}
            {' '}
            {!phoneHere && (
              <button className="link" type="button" onClick={locate} disabled={locating === 'busy'}>
                {locating === 'busy' ? t('locating') : t('use_phone_location')}
              </button>
            )}
          </p>
          {locating === 'denied' && <p className="small" role="status">{t('location_denied')}</p>}

          {match.kind === 'none_in_reach' && (
            <p className="alert" role="status">{t('none_in_reach', { services: list(match.needs) })}</p>
          )}
          {match.kind === 'unfiltered' && <p className="alert" role="status">{t('refer_unfiltered')}</p>}

          <fieldset className="facs">
            <legend className="sr">{t('refer_choose_legend')}</legend>
            {shown.map((o) => (
              <FacilityCard key={o.facility.id} o={o} selected={chosen === o.facility.id} onSelect={() => setChosen(o.facility.id)} />
            ))}
          </fieldset>
          <button className="link" type="button" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('show_suggested') : t('show_all_facilities', { n: everyone.length })}
          </button>

          <label className="field">
            {t('initials_label')}
            <input
              value={initialsInput}
              onChange={(e) => setInitialsInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={60}
              aria-describedby="initials-hint"
            />
            <span className="small" id="initials-hint">
              {initials ? t('initials_preview', { initials }) : t('initials_hint')}
            </span>
          </label>
          {image && pick && receives[pick.facility.id] === false && (
            <p className="small" role="status">{t('image_receiver_no_key')}</p>
          )}
          {image && pick && receives[pick.facility.id] === true && (
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <span className="strong">{t('image_consent_label')}</span>
                <span className="small">{t('image_consent_hint')}</span>
              </span>
            </label>
          )}
        </>
      )}

      {step.name === 'failed' && <p className="alert" role="alert">{t('refer_failed')}</p>}
      <div className="spacer" />
      <p className="lead strong center">{t('reminder')}</p>
      <button
        className="btn btn-primary"
        type="button"
        disabled={!pick || !caseId || step.name === 'sending'}
        onClick={() => void send()}
      >
        {step.name === 'sending' ? t('refer_sending') : pick ? t('refer_send', { name: pick.facility.name }) : t('refer_pick_first')}
      </button>
    </main>
  );
}
