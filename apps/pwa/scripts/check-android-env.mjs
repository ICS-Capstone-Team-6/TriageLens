// Fail rather than publish an APK with a silently disabled backend or model.
const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_MODEL_URL', 'VITE_MODEL_SHA256'];
for (const name of names) {
  if (!process.env[name]?.trim()) throw new Error(`Missing public APK configuration: ${name}`);
}
for (const name of ['VITE_SUPABASE_URL', 'VITE_MODEL_URL']) {
  if (new URL(process.env[name]).protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
}
if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  throw new Error('APK builds accept a Supabase publishable key only; never a service-role key');
}
if (!/^[0-9a-f]{64}$/i.test(process.env.VITE_MODEL_SHA256)) throw new Error('Invalid model SHA-256');
console.log('Public APK configuration is present; no values printed.');
