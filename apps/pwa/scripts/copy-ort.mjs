// Copy ONNX Runtime Web's WebAssembly files into public/ort so the app serves them
// itself (no third-party scripts, NFR-SEC-05; works under COEP require-corp).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const to = join(root, 'public', 'ort');
mkdirSync(to, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) cpSync(join(from, f), join(to, f));
console.log('copied ONNX Runtime Web wasm to public/ort');
