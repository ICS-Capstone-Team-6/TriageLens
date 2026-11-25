// Development-only demo referral data (`?demo`). FAKE facilities copied from
// supabase/seed.sql so the referral screens can be clicked through with no backend.
// Nothing is sent anywhere; the code is made up on the phone.
import type { CamForShare, DirectoryCache, ReferralDraft, SentReferral, ShareResult } from '../lib/referral/api';
import { renderHeatmap } from '../lib/heatmap';
import type { Screened } from '../inference/messages';
import type { InboxDeps, KeyStatus, Outcome, ReferralDetail, Status } from '../lib/referral/inbox';
import type { AmbulanceDeps, AmbulanceRequest } from '../lib/referral/ambulance';
import type { FacilityDeps, MyFacility, WeekRow } from '../lib/referral/stats';
import type { Zone } from '../lib/triage';
import type { Facility, OpeningHours } from '../lib/referral/match';
import type { ReferralDeps } from '../screens/Referral';

const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day).toISOString();
const weekdays = (open: string, close: string): OpeningHours =>
  Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [[open, close] as [string, string]]]));

export const DEMO_OWN_ID = 'demo-clinic-a';

export const DEMO_FACILITIES: Facility[] = [
  { id: DEMO_OWN_ID, name: 'FAKE Test Clinic A', district: 'Demo district A', region: 'Demo region', lat: 5.65, lng: -0.19, phone: '+233000000001', openingHours: null, services: ['tb_treatment'], servicesConfirmedAt: ago(10) },
  { id: 'demo-accra', name: 'FAKE Regional Hospital Accra', district: 'Demo Accra', region: 'Demo Greater Accra', lat: 5.6037, lng: -0.187, phone: '+233000000101', openingHours: { always: true }, services: ['tb_rapid_test', 'tb_treatment', 'chest_xray', 'oxygen', 'inpatient', 'eye_clinic', 'retina_laser', 'retina_injection', 'ambulance'], servicesConfirmedAt: ago(12) },
  { id: 'demo-koforidua', name: 'FAKE Health Centre Koforidua', district: 'Demo Koforidua', region: 'Demo Eastern', lat: 6.0941, lng: -0.2591, phone: '+233000000104', openingHours: { ...weekdays('08:00', '17:00'), sat: [['09:00', '13:00'] as [string, string]] }, services: ['tb_treatment'], servicesConfirmedAt: ago(20) },
  { id: 'demo-ho', name: 'FAKE District Hospital Ho', district: 'Demo Ho', region: 'Demo Volta', lat: 6.6008, lng: 0.4713, phone: '+233000000105', openingHours: { always: true }, services: ['tb_rapid_test', 'chest_xray', 'oxygen', 'inpatient'], servicesConfirmedAt: ago(200) },
  { id: 'demo-cape-coast', name: 'FAKE Polyclinic Cape Coast', district: 'Demo Cape Coast', region: 'Demo Central', lat: 5.1053, lng: -1.2466, phone: '+233000000106', openingHours: weekdays('08:00', '17:00'), services: ['tb_rapid_test', 'tb_treatment', 'eye_clinic'], servicesConfirmedAt: ago(60) },
  { id: 'demo-kumasi', name: 'FAKE District Hospital Kumasi', district: 'Demo Kumasi', region: 'Demo Ashanti', lat: 6.6885, lng: -1.6244, phone: '+233000000102', openingHours: { always: true }, services: ['tb_rapid_test', 'tb_treatment', 'chest_xray', 'oxygen', 'inpatient', 'ambulance'], servicesConfirmedAt: ago(30) },
  { id: 'demo-takoradi', name: 'FAKE Hospital Takoradi', district: 'Demo Takoradi', region: 'Demo Western', lat: 4.8845, lng: -1.7554, phone: '+233000000107', openingHours: { always: true }, services: ['chest_xray', 'oxygen', 'inpatient', 'ambulance'], servicesConfirmedAt: ago(15) },
  { id: 'demo-tamale', name: 'FAKE Teaching Hospital Tamale', district: 'Demo Tamale', region: 'Demo Northern', lat: 9.4008, lng: -0.8393, phone: '+233000000108', openingHours: { always: true }, services: ['tb_rapid_test', 'tb_treatment', 'chest_xray', 'oxygen', 'inpatient', 'eye_clinic', 'retina_laser', 'ambulance'], servicesConfirmedAt: ago(25) },
];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function demoCode(initials: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = initials;
  for (let i = 0; out.length < 8; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoReferral: ReferralDeps = {
  async loadDirectory(): Promise<DirectoryCache> {
    await wait(200);
    return { savedAt: new Date().toISOString(), facilities: DEMO_FACILITIES };
  },
  async ownFacilityId() { return DEMO_OWN_ID; },
  async send(d: ReferralDraft): Promise<SentReferral> {
    await wait(600);
    const to = DEMO_FACILITIES.find((f) => f.id === d.toFacility);
    const sent = { id: d.id, code: demoCode(d.initials), initials: d.initials, expiresAt: new Date(Date.now() + 60 * day).toISOString() };
    store.push(rec(sent.id, sent.code, d.initials, DEMO_OWN_ID, to?.id ?? '', 'created', 0, d.urgency ?? null, 'refer_now'));
    return sent;
  },
  async shareImage(referralId: string, file: Blob, cam: CamForShare | null, toFacility: string): Promise<ShareResult> {
    await wait(700);
    if (!DEMO_KEYS.has(toFacility)) return 'no_receiver_key';
    const r = store.find((x) => x.detail.referral.id === referralId);
    if (!r) return 'failed';
    const heat = cam ? await renderHeatmap(file, cam.data, cam.h, cam.w) : null;
    images.set(referralId, { image: URL.createObjectURL(file), heatmap: heat ? URL.createObjectURL(heat) : null });
    r.detail.referral.imageShared = true;
    return 'shared';
  },
  async canReceiveImages(facilityId: string) {
    await wait(100);
    return DEMO_KEYS.has(facilityId);
  },
};

// Demo images stay in this tab's memory as object URLs; nothing is uploaded or encrypted.
const images = new Map<string, { image: string; heatmap: string | null }>();
// Facilities that have set up image sharing in the demo. Koforidua has not, to show that path.
const DEMO_KEYS = new Set([DEMO_OWN_ID, 'demo-accra', 'demo-kumasi', 'demo-ho', 'demo-cape-coast', 'demo-tamale', 'demo-takoradi']);
let demoUnlocked = false;

/** A made-up heatmap: one warm patch in the upper right lung field. Demo only. */
export function demoCam(r: Screened): CamForShare | null {
  if (r.logit === null) return null;
  const h = 10, w = 10;
  const data = new Float32Array(h * w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.max(0, 1 - Math.hypot(x - 3, y - 3) / 3.5);
  return { data, h, w };
}

// In-memory referrals for the demo inbox. FAKE people: initials only, made-up symptoms.
interface DemoRec {
  detail: ReferralDetail;
}
const store: DemoRec[] = [];
const fac = (id: string) => DEMO_FACILITIES.find((f) => f.id === id);

function rec(id: string, code: string, initials: string, from: string, to: string, status: Status, daysAgo: number,
  urgency: string | null, zone: Zone, symptoms: string[] = []): DemoRec {
  const at = ago(daysAgo);
  const events: ReferralDetail['events'] = [{ status: 'created', note: '', at }];
  if (status !== 'created') events.push({ status: 'seen', note: '', at });
  return {
    detail: {
      referral: {
        id, code, initials, status, outcome: null, fromFacility: from, fromName: fac(from)?.name ?? '', toFacility: to,
        toName: fac(to)?.name ?? '', conditions: ['tb'], urgency, createdAt: at, expiresAt: ago(daysAgo - 60), imageShared: false,
        fromPhone: fac(from)?.phone ?? '', toPhone: fac(to)?.phone ?? '',
      },
      ageBand: '35-44', sex: null, symptoms,
      results: [{ zone, modelVersion: 'demo-stand-in', thresholdsVersion: 'demo-only', createdAt: at }],
      events,
    },
  };
}

store.push(
  rec('demo-in-1', 'EAB7QM4X', 'EAB', 'demo-koforidua', DEMO_OWN_ID, 'created', 1, 'days', 'refer_now', ['cough_2_weeks', 'night_sweats']),
  rec('demo-in-2', 'YK3HP9TZ', 'YK', 'demo-kumasi', DEMO_OWN_ID, 'seen', 3, 'days', 'unsure', ['weight_loss']),
  rec('demo-out-1', 'AO9RW2LC', 'AO', DEMO_OWN_ID, 'demo-accra', 'seen', 9, 'days', 'refer_now'),
);

let failures = 0;
const clone = (d: ReferralDetail): ReferralDetail => JSON.parse(JSON.stringify(d)) as ReferralDetail;
const RANK: Status[] = ['created', 'seen', 'arrived', 'tested', 'closed'];

function markSeen(r: DemoRec) {
  if (r.detail.referral.status === 'created') {
    r.detail.referral.status = 'seen';
    r.detail.events.push({ status: 'seen', note: '', at: new Date().toISOString() });
  }
}

export const demoInbox: InboxDeps = {
  async list(direction) {
    await wait(150);
    return store
      .filter((r) => (direction === 'sent' ? r.detail.referral.fromFacility : r.detail.referral.toFacility) === DEMO_OWN_ID)
      .map((r) => clone(r.detail).referral)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async lookup(code) {
    await wait(300);
    if (failures >= 10) return 'locked';
    const c = code.toUpperCase().replace(/[\s-]/g, '');
    const r = store.find((x) => x.detail.referral.code === c && x.detail.referral.toFacility === DEMO_OWN_ID);
    if (!r) { failures += 1; return null; }
    markSeen(r);
    return clone(r.detail);
  },
  async open(id) {
    await wait(150);
    const r = store.find((x) => x.detail.referral.id === id);
    if (!r) return null;
    if (r.detail.referral.toFacility === DEMO_OWN_ID) markSeen(r);
    return clone(r.detail);
  },
  async advance(id, status, outcome?: Outcome, note?: string) {
    await wait(300);
    const r = store.find((x) => x.detail.referral.id === id && x.detail.referral.toFacility === DEMO_OWN_ID);
    if (!r || RANK.indexOf(status) <= RANK.indexOf(r.detail.referral.status)) return r ? clone(r.detail) : null;
    r.detail.referral.status = status;
    if (outcome) r.detail.referral.outcome = outcome;
    r.detail.events.push({ status, note: note ?? '', at: new Date().toISOString() });
    return clone(r.detail);
  },
  async openImage(id) {
    await wait(200);
    if (!demoUnlocked) return { kind: 'locked' };
    const got = images.get(id);
    return got ? { kind: 'ok', ...got } : { kind: 'failed' };
  },
  async keyStatus(): Promise<KeyStatus> {
    return { hasKey: true, unlocked: demoUnlocked, canSetUp: false };
  },
  async unlock(passphrase: string) {
    await wait(400);
    demoUnlocked = passphrase.trim().length > 0; // demo: any passphrase works
    return demoUnlocked;
  },
  async setUpKey() { return true; },
};

// Demo ambulance requests. One incoming request is already waiting; requests the demo
// clinic sends are "seen" after 5 seconds and "dispatched" after 12, to show each state.
const ambs: AmbulanceRequest[] = [];
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
function ambFor(refId: string, reason: AmbulanceRequest['reason'], note: string, createdAt: string, id: string = crypto.randomUUID()): AmbulanceRequest | null {
  const r = store.find((x) => x.detail.referral.id === refId)?.detail.referral;
  if (!r) return null;
  return {
    id, referralId: refId, code: r.code, initials: r.initials, reason, note, status: 'requested', etaMinutes: null, answerNote: '',
    fromName: r.fromName, fromPhone: r.fromPhone, toName: r.toName, toPhone: r.toPhone, createdAt, seenAt: null, answeredAt: null,
  };
}
const seeded = ambFor('demo-in-2', 'breathing_hard', '', minsAgo(12), 'demo-amb-in');
if (seeded) ambs.push(seeded);

export const demoAmbulance: AmbulanceDeps = {
  async list(direction) {
    await wait(120);
    const mine = (a: AmbulanceRequest) => {
      const r = store.find((x) => x.detail.referral.id === a.referralId)?.detail.referral;
      return direction === 'sent' ? r?.fromFacility === DEMO_OWN_ID : r?.toFacility === DEMO_OWN_ID;
    };
    return ambs.filter(mine).map((a) => ({ ...a }));
  },
  async request(q) {
    await wait(500);
    if (!navigator.onLine) return { kind: 'offline' };
    if (ambs.some((a) => a.referralId === q.referralId && (a.status === 'requested' || a.status === 'seen'))) return { kind: 'already_open' };
    const a = ambFor(q.referralId, q.reason, q.note.trim(), new Date().toISOString(), q.id);
    if (!a) return { kind: 'failed' };
    ambs.push(a);
    setTimeout(() => { if (a.status === 'requested') { a.status = 'seen'; a.seenAt = new Date().toISOString(); } }, 5_000);
    setTimeout(() => { if (a.status === 'seen') { a.status = 'dispatched'; a.etaMinutes = 30; a.answeredAt = new Date().toISOString(); } }, 12_000);
    return { kind: 'ok', request: { ...a } };
  },
  async answer(id, status, eta, note) {
    await wait(300);
    const a = ambs.find((x) => x.id === id);
    if (!a) return null;
    a.status = status;
    a.seenAt = a.seenAt ?? new Date().toISOString();
    if (status === 'dispatched') a.etaMinutes = eta ?? 30;
    if (status === 'cannot_send') a.answerNote = note ?? '';
    return { ...a };
  },
  async cancel(id) {
    await wait(200);
    const a = ambs.find((x) => x.id === id);
    if (!a) return null;
    a.status = 'cancelled';
    return { ...a };
  },
};

// Demo facility page: the demo clinic's admin view with made-up weekly numbers.
const demoFac: MyFacility = { id: DEMO_OWN_ID, name: 'FAKE Test Clinic A', phone: '+233000000001', services: ['tb_treatment'], servicesConfirmedAt: ago(104) };
function demoWeeks(n: number): WeekRow[] {
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const made = [[6, 5, 3, 2, 1, 2, 1, 1, 1], [9, 7, 6, 4, 1, 3, 2, 2, 1], [4, 4, 4, 1, 0, 1, 0, 0, 0], [7, 5, 4, 3, 2, 2, 1, 0, 1],
    [5, 4, 3, 2, 1, 0, 0, 0, 0], [8, 6, 5, 3, 1, 4, 2, 2, 2], [3, 3, 2, 1, 0, 1, 0, 0, 0], [6, 4, 4, 2, 1, 2, 1, 1, 1]];
  return Array.from({ length: n }, (_, i) => {
    const w = new Date(monday.getTime() - i * 7 * day);
    const [sent, arrived, tested, confirmed, notArrived7d, received, ambRequests, ambSeen10min, ambDispatched] = made[i % made.length];
    return { week: w.toISOString().slice(0, 10), facilityId: DEMO_OWN_ID, facilityName: demoFac.name, sent, arrived, tested, confirmed,
      notArrived7d: i === 0 ? 0 : notArrived7d, received, ambRequests, ambSeen10min, ambDispatched };
  });
}
export const demoFacility: FacilityDeps = {
  async role() { return 'admin'; },
  async myFacility() { await wait(150); return { ...demoFac }; },
  async saveServices(_id, services, phone) {
    await wait(400);
    Object.assign(demoFac, { services: [...services], phone, servicesConfirmedAt: new Date().toISOString() });
    const own = DEMO_FACILITIES.find((f) => f.id === DEMO_OWN_ID);
    if (own) Object.assign(own, { services: [...services], phone, servicesConfirmedAt: demoFac.servicesConfirmedAt });
    return { ...demoFac };
  },
  async stats(weeks) { await wait(200); return demoWeeks(weeks); },
};
