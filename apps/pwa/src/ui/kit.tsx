// Small shared components for the "clinic under open sky" design (ui/sky.css).
// Plain React with no UI library, so the app shell stays small on low-end phones.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../strings';
import { AlertCircle, Back, Close, Info, Minus, Plus, ZoneIcon, List, ArrowUpRight, Scan, Building, MapIcon } from './icons';

export function TopBar({ title, onBack, close = false, big = false, right }: { title: ReactNode; onBack?: () => void; close?: boolean; big?: boolean; right?: ReactNode }) {
  return (
    <header className="bar">
      {onBack && (
        <button className="round" type="button" aria-label={close ? t('close') : t('back')} onClick={onBack}>
          {close ? <Close /> : <Back />}
        </button>
      )}
      <h1 className={big ? 'bar-big' : 'bar-title'}>{title}</h1>
      {right && <span className="right">{right}</span>}
    </header>
  );
}

/** Bottom action area; the reminder line sits above the main action on every result screen. */
export function Foot({ children, remind = true }: { children: ReactNode; remind?: boolean }) {
  return (
    <div className="foot">
      <div className="foot-in">
        {remind && <p className="remind">{t('reminder')}</p>}
        {children}
      </div>
    </div>
  );
}

export type Tab = 'screen' | 'cases' | 'referrals' | 'map' | 'facility';

/** The floating obsidian dock (the one navigation pattern the user asked to keep). */
export function Dock({ current, tabs }: { current: Tab; tabs: { id: Tab; href: string }[] }) {
  const icon = { screen: <Scan size={17} />, cases: <List size={17} />, referrals: <ArrowUpRight size={17} />, map: <MapIcon size={17} />, facility: <Building size={17} /> };
  const label = { screen: t('nav_screen'), cases: t('nav_cases'), referrals: t('nav_referrals'), map: t('nav_map'), facility: t('nav_facility') };
  return (
    <nav className="dock" aria-label={t('nav_label')}>
      {tabs.map((x) => (
        <a key={x.id} href={x.href} aria-current={x.id === current ? 'page' : undefined}>
          {icon[x.id]}<span>{label[x.id]}</span>
        </a>
      ))}
    </nav>
  );
}

export function Notice({ tone = 'info', children, role }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div className={`notice notice-${tone}`} role={role}>
      {tone === 'info' ? <Info /> : <AlertCircle />}
      <span>{children}</span>
    </div>
  );
}

export function ZoneRow({ zone, word, sub }: { zone: 'refer_now' | 'unsure' | 'low_risk'; word: string; sub?: string }) {
  return (
    <div className={`zone zone-${zone}`}>
      <ZoneIcon zone={zone} size={22} />
      <span>
        <span className="zone-word">{word}</span>
        {sub && <span className="t-small" style={{ display: 'block', color: 'inherit' }}>{sub}</span>}
      </span>
    </div>
  );
}

export function Facts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="facts">
      {rows.map(([k, v], i) => (
        <div key={i}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/**
 * Bottom sheet with a scrim. Escape and the scrim close it; focus moves into it on open and
 * back to the opener on close. Not used where an inline control would do (impeccable: no
 * modal as a first thought).
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <span className="grab" aria-hidden="true" />
        {children}
      </section>
    </>
  );
}

/** Beds stepper: one bigger target per side, the count announced as it changes. */
export function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper">
      <button className="round" type="button" aria-label={t('beds_less')} onClick={() => onChange(Math.max(0, value - 1))}><Minus size={22} /></button>
      <p style={{ textAlign: 'center' }}>
        <b aria-live="polite" aria-label={label}>{value}</b>
        <span className="t-small" style={{ display: 'block' }}>{t('beds_free_of', { total: max })}</span>
      </p>
      <button className="round" type="button" aria-label={t('beds_more')} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={22} /></button>
    </div>
  );
}

/**
 * Empty or nothing-found state: a drawn mark, one plain title, one line on what to do next,
 * and at most one action (an empty screen is an invitation to act, not a dead end).
 */
export function Empty({ icon, title, body, action, tone = 'calm', role }: {
  icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode; tone?: 'calm' | 'problem'; role?: 'status' | 'alert';
}) {
  return (
    <div className={`empty${tone === 'problem' ? ' empty-problem' : ''}`} role={role}>
      <span className="empty-mark" aria-hidden="true">{icon}</span>
      <p className="empty-title">{title}</p>
      {body && <p className="empty-body">{body}</p>}
      {action}
    </div>
  );
}

/** True on screens wide enough for list and detail side by side (matches sky.css 1024px). */
export function useWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
