// One stroke icon set for the whole app: 24-unit grid, 2px stroke, round caps, drawn in
// currentColor so an icon takes its text colour. No emoji or glyph icons.
// Zone icons: triangle-alert (refer now), question (not sure), arrow down (low risk).
// No check mark on Low risk: it can read as "all clear" (H1, H2).
import type { ReactNode } from 'react';

type P = { size?: number; color?: string; label?: string };

function Svg({ size = 20, color = 'currentColor', label, children }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {children}
    </svg>
  );
}

export const Mark = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2.2" />
    <path d="M17 17l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 11h2.2l1.4-3 2 6 1.4-3h2" stroke="#2597d0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Back = (p: P) => <Svg {...p}><path d="M15 6l-6 6l6 6" /></Svg>;
export const Close = (p: P) => <Svg {...p}><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></Svg>;
export const Plus = (p: P) => <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
export const Minus = (p: P) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const Check = (p: P) => <Svg {...p}><path d="M5 12l5 5l10 -10" /></Svg>;
export const Search = (p: P) => <Svg {...p}><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></Svg>;
export const Camera = (p: P) => <Svg {...p}><path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></Svg>;
export const ImageIcon = (p: P) => <Svg {...p}><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></Svg>;
export const Phone = (p: P) => <Svg {...p}><path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" /></Svg>;
export const Clock = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 7v5l3 3" /></Svg>;
export const Bed = (p: P) => <Svg {...p}><path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M22 17v-3h-20" /><path d="M2 8v9" /><path d="M12 14h10v-2a3 3 0 0 0 -3 -3h-7v5z" /></Svg>;
export const Lock = (p: P) => <Svg {...p}><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></Svg>;
export const Unlock = (p: P) => <Svg {...p}><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M8 11v-5a4 4 0 0 1 8 0" /></Svg>;
export const Ambulance = (p: P) => <Svg {...p}><path d="M5 17a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M15 17a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" /><path d="M6 10h4m-2 -2v4" /></Svg>;
export const Alert = (p: P) => <Svg {...p}><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></Svg>;
export const Info = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></Svg>;
export const AlertCircle = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" /></Svg>;
export const Question = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 16v.01" /><path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" /></Svg>;
export const ArrowDown = (p: P) => <Svg {...p}><path d="M12 5v14" /><path d="M18 13l-6 6" /><path d="M6 13l6 6" /></Svg>;
export const ArrowUpRight = (p: P) => <Svg {...p}><path d="M7 7h10v10" /><path d="M7 17l10 -10" /></Svg>;
export const ArrowDownLeft = (p: P) => <Svg {...p}><path d="M17 17h-10v-10" /><path d="M17 7l-10 10" /></Svg>;
export const Inbox = (p: P) => <Svg {...p}><path d="M4 13h3l2 3h6l2 -3h3" /><path d="M4 13l2.5 -7h11l2.5 7v5a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /></Svg>;
export const Folder = (p: P) => <Svg {...p}><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" /></Svg>;
export const Retake = (p: P) => <Svg {...p}><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></Svg>;
export const Pin = (p: P) => <Svg {...p}><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" /></Svg>;
export const Wifi = (p: P) => <Svg {...p}><path d="M12 18l.01 0" /><path d="M9.172 15.172a4 4 0 0 1 5.656 0" /><path d="M6.343 12.343a8 8 0 0 1 11.314 0" /><path d="M3.515 9.515c4.686 -4.687 12.284 -4.687 17 0" /></Svg>;
export const WifiOff = (p: P) => <Svg {...p}><path d="M12 18l.01 0" /><path d="M9.172 15.172a4 4 0 0 1 5.656 0" /><path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2" /><path d="M3 3l18 18" /></Svg>;
export const List = (p: P) => <Svg {...p}><path d="M9 6l11 0" /><path d="M9 12l11 0" /><path d="M9 18l11 0" /><path d="M5 6l0 .01" /><path d="M5 12l0 .01" /><path d="M5 18l0 .01" /></Svg>;
export const Building = (p: P) => <Svg {...p}><path d="M3 21l18 0" /><path d="M5 21v-14l8 -4v18" /><path d="M19 21v-10l-6 -4" /><path d="M9 9l0 .01" /><path d="M9 12l0 .01" /><path d="M9 15l0 .01" /><path d="M9 18l0 .01" /></Svg>;
export const MapIcon = (p: P) => <Svg {...p}><path d="M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13" /><path d="M9 4v13" /><path d="M15 7v13" /></Svg>;
export const Chart = (p: P) => <Svg {...p}><path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /><path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /><path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /></Svg>;
export const Scan = (p: P) => <Svg {...p}><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" /><path d="M8 12h8" /></Svg>;
export const Out = (p: P) => <Svg {...p}><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></Svg>;
export const Print = (p: P) => <Svg {...p}><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" /><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" /><path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" /></Svg>;

/** Zone icon in the zone's own icon colour (TRD 7.3: colour plus icon plus text). */
export function ZoneIcon({ zone, size = 26 }: { zone: 'refer_now' | 'unsure' | 'low_risk'; size?: number }) {
  if (zone === 'refer_now') return <Alert size={size} color="#b42f18" />;
  if (zone === 'unsure') return <Question size={size} color="#a87400" />;
  return <ArrowDown size={size} color="#2f8a12" />;
}

/** A drawn chest film for empty and loading states; never presented as a real image. */
export const Film = ({ width = 170 }: { width?: number }) => (
  <svg width={width} height={Math.round(width * 1.23)} viewBox="0 0 220 270" fill="none" aria-hidden="true">
    <path d="M110 18v236" stroke="#9aa3b5" strokeWidth="10" strokeLinecap="round" opacity=".5" />
    <path d="M100 52c-34 2-60 14-74 42M100 82c-36 2-64 16-78 44M100 112c-36 3-62 18-74 46M100 142c-32 4-56 18-66 42M120 52c34 2 60 14 74 42M120 82c36 2 64 16 78 44M120 112c36 3 62 18 74 46M120 142c32 4 56 18 66 42" stroke="#c9d1df" strokeWidth="5" strokeLinecap="round" opacity=".62" />
  </svg>
);
