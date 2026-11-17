import en from './en.json';

export type StringKey = keyof typeof en;

/** Look up a UI string; `{name}` placeholders are filled from `vars`. */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
