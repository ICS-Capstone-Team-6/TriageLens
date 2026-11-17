// One consistent stroke icon set, drawn for the app (impeccable: no emoji or glyph icons).
// Zone icons: arrow to clinic (refer), question mark (not sure), down arrow (low risk).
// No check mark on low risk: it can read as "all clear" (H1, H2).
type P = { size?: number; color?: string };

export const Mark = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="9" stroke="#5350cc" strokeWidth="2.5" />
    <path d="M21 21l7 7" stroke="#5350cc" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M8 14h3l2-4 3 8 2-4h2" stroke="#0075c9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Back = ({ color = '#16165c' }: P) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Camera = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="6" width="18" height="14" rx="4" stroke="#ffffff" strokeWidth="2" />
    <circle cx="12" cy="13" r="3.5" stroke="#ffffff" strokeWidth="2" />
    <path d="M9 6l1.5-2h3L15 6" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const Phone = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="6" y="2.5" width="12" height="19" rx="3" stroke="#16165c" strokeWidth="2" />
    <path d="M10 18h4" stroke="#16165c" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const Clock = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" stroke="#16165c" strokeWidth="2" />
    <path d="M12 7v6l3.5 2" stroke="#16165c" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const Retake = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="21" stroke="#16165c" strokeWidth="2.5" />
    <path d="M16 22a9 9 0 0115-5l2 2M32 26a9 9 0 01-15 5l-2-2" stroke="#16165c" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M33 13v6h-6M15 35v-6h6" stroke="#16165c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const XRay = () => (
  <svg width="150" height="190" viewBox="0 0 180 220" fill="none" aria-hidden="true">
    <rect x="6" y="6" width="168" height="208" rx="18" stroke="#5350cc" strokeWidth="1.5" />
    <path d="M90 30v150" stroke="#5350cc" strokeWidth="1.5" />
    <path d="M84 50c-30 6-52 40-52 90 0 22 8 34 20 34 18 0 32-14 32-40z" stroke="#5350cc" strokeWidth="1.5" />
    <path d="M96 50c30 6 52 40 52 90 0 22-8 34-20 34-18 0-32-14-32-40z" stroke="#5350cc" strokeWidth="1.5" />
    <path d="M40 70h100M36 92h108M34 114h112M36 136h108" stroke="#5350cc" strokeWidth="1" strokeDasharray="3 5" />
  </svg>
);

export function ZoneIcon({ zone }: { zone: 'refer_now' | 'unsure' | 'low_risk' }) {
  const s = { stroke: '#16165c', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="21" stroke="#16165c" strokeWidth="3" />
      {zone === 'refer_now' && (<><path d="M12 24h17M23 16l8 8-8 8" {...s} /><path d="M36 15v18" {...s} /></>)}
      {zone === 'unsure' && (<><path d="M18 19a6 6 0 1111 3c-2 2-5 3-5 6v1" {...s} /><circle cx="24" cy="35" r="2" fill="#16165c" /></>)}
      {zone === 'low_risk' && <path d="M24 12v21M16 26l8 8 8-8" {...s} />}
    </svg>
  );
}
