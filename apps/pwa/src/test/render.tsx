// Tiny render helper for screen tests (jsdom). Plain react-dom with act, no testing library,
// so the only new dev dependency is jsdom.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Rendered {
  el: HTMLElement;
  text: () => string;
  click: (target: Element | null) => Promise<void>;
  flush: () => Promise<void>;
  unmount: () => void;
}

export async function render(ui: ReactNode): Promise<Rendered> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  let root: Root | undefined;
  await act(async () => { root = createRoot(el); root.render(ui); });
  // IndexedDB work in effects resolves over several macrotasks.
  const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  return {
    el,
    text: () => el.textContent ?? '',
    click: async (target) => {
      if (!target) throw new Error('nothing to click');
      await act(async () => { (target as HTMLElement).click(); });
      await flush();
    },
    flush,
    unmount: () => { act(() => root?.unmount()); el.remove(); },
  };
}

/** Words the app must never show on a result (TRD 7.3, CLAUDE.md rule 1). */
export const FORBIDDEN = /\b(diagnos\w*|positive|negative|healthy)\b|you do not have|does not have|no disease/i;
