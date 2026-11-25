// Refer to a facility (E10-03, E10-06; ADR-22, ADR-28). The worker picks one of the
// nearest facilities that has the services this result needs; the app never picks for
// them (hazard H20). Distances are straight-line estimates (H17); services not confirmed
// recently say "Check by phone first" (H16). Then a slip shows the referral code.
import { useEffect, useMemo, useState } from 'react';
import { formatCode, toInitials, type CamForShare, type DirectoryCache, type ReferralDraft, type SentReferral, type ShareResult } from '../lib/referral/api';
import { distanceBand, distanceKm, isOpenAt, matchFacilities, validPoint, type Facility, type Match, type Option, type Point } from '../lib/referral/match';
import { bedState, hoursSince, LOW_BEDS } from '../lib/referral/beds';
import { RULES_V1, type ServiceTag, type Urgency } from '../lib/referral/rules';
import { t, type StringKey } from '../strings';
import { AlertCircle, Bed, Clock, Close, MapIcon, Phone, Pin, WifiOff } from '../ui/icons';
import { Empty, Facts, Foot, Notice, TopBar, ZoneRow } from '../ui/kit';
import { AmbulancePanel } from './Ambulance';
import type { AmbulanceDeps } from '../lib/referral/ambulance';

export interface ReferralDeps {
  loadDirectory: () => Promise<DirectoryCache | null>;
  ownFacilityId: () => Promise<string | null>;
  send: (d: ReferralDraft) => Promise<SentReferral | null | 'no_beds'>;
  shareImage: (referralId: string, file: Blob, cam: CamForShare | null, toFacility: string, ownFacility: string | null) => Promise<ShareResult>;
  canReceiveImages: (facilityId: string) => Promise<boolean>;
}

interface Props {
  zone: 'refer_now' | 'unsure';
  caseId: string | null; // null when the screening was not saved: cannot be sent yet
  image: Blob | null; // the screened image, kept in memory only; shared only with consent
  cam: CamForShare | null; // heatmap for the receiving clinician, when the model gives one
  deps: ReferralDeps;
  ambulance: AmbulanceDeps | null; // null while the feature is off
  versions: string;
  onBack: () => void;
  onDone: () => void;
}

type ImageState = 'none' | 'sending' | 'shared' | 'failed' | 'no_receiver_key';
type Step = { name: 'choose' } | { name: 'sending' } | { name: 'failed' } | { name: 'no_beds' } | { name: 'sent'; sent: SentReferral; to: Option; image: ImageState };

const svc = (tag: ServiceTag | string) => t(`service_${tag}` as StringKey);
const list = (tags: string[]) => tags.map(svc).join(', ');

function km(o: Option) {
  return o.distanceKm < 1 ? t('distance_under_1') : t('distance_km', { km: Math.round(o.distanceKm) });
}

function FacilityCard({ o, selected, onSelect }: { o: Option; selected: boolean; onSelect: () => void }) {
  const f = o.facility;
  const hours = o.openNow === true ? t('open_now') : o.openNow === false ? t('closed_now') : t('hours_unknown');
  return (
    <label className="opt">
      <input type="radio" name="facility" checked={selected} onChange={onSelect} disabled={o.beds === 'low'} />
      <span className="row"><span className="opt-name">{f.name}</span><span className="km">{Math.max(1, Math.round(o.distanceKm))}<small>km</small></span></span>
      <span className="meta"><Clock size={15} color="#2597d0" />{hours}</span>
      {o.beds === 'ok' && f.beds && <span className="meta"><Bed size={15} color="#2597d0" />{t('beds_free_n', { n: f.beds.free })}</span>}
      {o.beds === 'low' && f.beds && <span className="meta meta-danger"><Bed size={15} />{t('beds_low_blocked', { n: f.beds.free, max: LOW_BEDS })}</span>}
      {o.beds === 'low' && f.phone && <a className="link opt-call" href={`tel:${f.phone}`}><Phone size={16} />{t('call_facility', { phone: f.phone })}</a>}
      {o.beds === 'stale' && f.beds && (
        <span className="meta meta-warn"><Bed size={15} />{hoursSince(f.beds.updatedAt, new Date()) === null ? t('beds_never_updated') : t('beds_stale', { h: hoursSince(f.beds.updatedAt, new Date()) ?? 0 })}</span>
      )}
      {o.missing.length > 0 && <span className="meta meta-warn"><AlertCircle size={15} />{t('missing_services', { services: list(o.missing) })}</span>}
      {o.stale && (
        <span className="meta meta-warn"><Phone size={15} />{o.confirmedDaysAgo === null ? t('services_never_confirmed') : t('services_stale', { days: o.confirmedDaysAgo })}</span>
      )}
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
    // The full list shows services too, so a worker picking from it still sees what each place has (H16).
    const needs = match.kind === 'matches' || match.kind === 'none_in_reach' ? match.needs : [];
    const opts: Option[] = pool.map((f) => {
      const d = here ? distanceKm(here, f) : 0;
      const conf = f.servicesConfirmedAt ? Date.parse(f.servicesConfirmedAt) : Number.NaN;
      const days = Number.isFinite(conf) ? Math.max(0, Math.floor((now.getTime() - conf) / 86_400_000)) : null;
      return {
        facility: f, distanceKm: d, distanceBand: distanceBand(d),
        has: needs.filter((s) => f.services.includes(s)), missing: needs.filter((s) => !f.services.includes(s)),
        preferredHas: [], openNow: isOpenAt(f.openingHours, now),
        stale: days === null || days > (RULES_V1?.staleAfterDays ?? 90), confirmedDaysAgo: days, beds: bedState(f.beds, now),
      };
    });
    return here ? opts.sort((a, b) => a.distanceKm - b.distanceKm) : opts.sort((a, b) => a.facility.name.localeCompare(b.facility.name));
  }, [facilities, here, own, match, now]);

  const suggested: Option[] =
    match.kind === 'matches' ? match.options
      : match.kind === 'unfiltered' ? match.options.slice(0, 3)
        : match.kind === 'none_in_reach' ? [match.nearestPartial, match.nearestBeyondReach].filter((o): o is Option => o !== null)
          : [];
  const shown = showAll || match.kind === 'no_location' ? everyone : suggested;
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
    if (sent === 'no_beds') return setStep({ name: 'no_beds' });
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

  if (step.name === 'sent') {
    const f = step.to.facility;
    return (
      <main className="screen">
        <section className="hero pane" aria-labelledby="slip-h">
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="round" type="button" aria-label={t('close')} onClick={onDone} style={{ background: 'rgba(255,255,255,.5)' }}><Close /></button>
            <h1 className="bar-title" id="slip-h">{t('slip_title')}</h1>
          </span>
          <p className="bigcode" aria-label={t('slip_code_label', { code: step.sent.code.split('').join(' ') })}>{formatCode(step.sent.code, step.sent.initials)}</p>
          <p style={{ fontSize: 15, fontWeight: 500 }}>{t('slip_give_code')}</p>
        </section>
        <div className="body has-foot pane">
          <Facts rows={[
            [t('slip_to'), <>{f.name}<span className="t-small" style={{ display: 'block' }}>{km(step.to)}</span></>],
            ...(urgency ? [[t('slip_when'), <>{t(`urgency_${urgency}` as StringKey)}{RULES_V1?.status === 'demo_draft' && <span className="t-cap" style={{ display: 'block' }}>{t('urgency_draft')}</span>}</>] as [string, React.ReactNode]] : []),
            [t('slip_image'), <span key="i" role="status">{t(`image_${step.image}` as StringKey)}</span>],
          ]} />
          {step.image === 'failed' && <button className="btn btn-ghost btn-full" type="button" onClick={() => void share(step.sent, step.to)}>{t('image_retry')}</button>}
          {ambulance ? <AmbulancePanel referralId={step.sent.id} toName={f.name} toPhone={f.phone} deps={ambulance} />
            : f.phone && <a className="btn btn-primary btn-full" href={`tel:${f.phone}`}><Phone />{t('call_facility', { phone: f.phone })}</a>}
          <p className="t-cap">{versions}</p>
        </div>
        <Foot><button className="btn btn-ghost btn-lg btn-full" type="button" onClick={onDone} style={{ background: '#fff' }}>{t('done_new')}</button></Foot>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar title={t('refer_header')} onBack={onBack} />
      <div className="body has-foot pane">
        <ZoneRow zone={zone} word={`${t(`zone_${zone}` as StringKey)}, ${t('condition_tb')}`} />
        <div className="stack-tight">
          <h2 className="t-display">{t('refer_title')}</h2>
          {match.kind === 'matches' && <p className="t-lead">{t('refer_lead', { services: list(match.needs) })}</p>}
          {RULES_V1?.status === 'demo_draft' && <p className="t-cap">{t('rules_demo_draft')}</p>}
        </div>

        {!caseId && <Notice tone="danger" role="alert">{t('refer_not_saved')}</Notice>}
        {directory === 'loading' && <p className="t-small" role="status">{t('refer_loading')}</p>}
        {directory === null && <Empty tone="problem" role="alert" icon={<WifiOff size={26} />} title={t('directory_missing_title')} body={t('refer_no_directory')} />}

        {directory && directory !== 'loading' && (
          <>
            {match.kind === 'none_in_reach' && <Notice tone="warn" role="status">{t('none_in_reach', { services: list(match.needs) })}</Notice>}
            {match.kind === 'unfiltered' && <Notice tone="warn" role="status">{t('refer_unfiltered')}</Notice>}

            {shown.length > 0 && shown.every((o) => o.beds === 'low') && <Notice tone="warn" role="status">{t('refer_all_full')}</Notice>}
            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
              <legend className="sr">{t('refer_choose_legend')}</legend>
              {shown.length === 0 && <Empty icon={<MapIcon size={26} />} title={t('directory_empty_title')} body={t('refer_none_listed')} />}
              {shown.map((o) => (
                <FacilityCard key={o.facility.id} o={o} selected={chosen === o.facility.id} onSelect={() => { setChosen(o.facility.id); setConsent(false); }} />
              ))}
            </fieldset>
            <div className="stack-tight">
              <p className="t-small"><Pin size={15} color="#2597d0" /> {phoneHere ? t('distance_from_phone') : here ? t('distance_from_clinic') : t('location_unknown')}</p>
              <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <button className="link" type="button" onClick={() => setShowAll((v) => !v)}>{showAll ? t('show_suggested') : t('show_all_facilities', { n: everyone.length })}</button>
                {!phoneHere && <button className="link" type="button" onClick={locate} disabled={locating === 'busy'}>{locating === 'busy' ? t('locating') : t('use_phone_location')}</button>}
              </span>
              {locating === 'denied' && <p className="t-small" role="status">{t('location_denied')}</p>}
            </div>

            <label className="field">
              {t('initials_label')}
              <input className="input code" value={initialsInput} onChange={(e) => setInitialsInput(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={60} placeholder="K A M" aria-describedby="initials-hint" />
              <span className="hint" id="initials-hint">
                {initials ? t('initials_preview', { initials, name: pick?.facility.name ?? t('the_facility') }) : t('initials_hint', { name: pick?.facility.name ?? t('the_facility') })}
              </span>
            </label>
            {image && pick && receives[pick.facility.id] === false && <p className="t-small" role="status">{t('image_receiver_no_key')}</p>}
            {image && pick && receives[pick.facility.id] === true && (
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span className="check-text"><span className="check-label">{t('image_consent_label', { name: pick.facility.name })}</span><span className="t-small">{t('image_consent_hint')}</span></span>
              </label>
            )}
          </>
        )}
        {step.name === 'failed' && <Notice tone="danger" role="alert">{t('refer_failed')}</Notice>}
        {step.name === 'no_beds' && <Notice tone="danger" role="alert">{t('refer_no_beds', { name: pick?.facility.name ?? t('the_facility') })}</Notice>}
      </div>
      <Foot>
        <button className="btn btn-primary btn-lg btn-full" type="button" disabled={!pick || pick.beds === 'low' || !caseId || step.name === 'sending'} onClick={() => void send()}>
          {step.name === 'sending' ? t('refer_sending') : pick ? t('refer_send', { name: pick.facility.name }) : t('refer_pick_first')}
        </button>
      </Foot>
    </main>
  );
}
