// Demo banner and outcome picker (development only). Sits above the app so it never covers
// the screen's own buttons. The banner states plainly that results are made up.
import { useEffect, useState } from 'react';
import { getOutcome, onOutcome, setOutcome, type DemoOutcome } from './demo';

const OPTIONS: { id: DemoOutcome; label: string }[] = [
  { id: 'refer_now', label: 'Refer now' },
  { id: 'unsure', label: 'Not sure' },
  { id: 'low_risk', label: 'Low risk' },
  { id: 'retake', label: 'Quality fails' },
];

export function DemoBar() {
  const [o, setO] = useState(getOutcome());
  useEffect(() => onOutcome(() => setO(getOutcome())), []);
  return (
    <aside className="demo-bar" aria-label="Demo controls">
      <p className="demo-title">Demo mode: results are made up, not from the TB model. Nothing is saved.</p>
      <div className="demo-row" role="radiogroup" aria-label="Next outcome">
        <span className="demo-label">Next outcome</span>
        {OPTIONS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={o === x.id} className={`demo-chip${o === x.id ? ' on' : ''}`} onClick={() => setOutcome(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
