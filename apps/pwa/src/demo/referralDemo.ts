// Development-only demo referral data (`?demo`). FAKE facilities copied from
// supabase/seed.sql so the referral screens can be clicked through with no backend.
// Nothing is sent anywhere; the code is made up on the phone.
import type { DirectoryCache, ReferralDraft, SentReferral } from '../lib/referral/api';
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
    return { id: d.id, code: demoCode(d.initials), initials: d.initials, expiresAt: new Date(Date.now() + 60 * day).toISOString() };
  },
};
