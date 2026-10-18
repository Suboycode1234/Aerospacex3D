import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('[Packer] Step 1: Running Vite build for single-file JS/CSS bundle...');
execSync('cmd.exe /c "npx vite build"', { cwd: rootDir, stdio: 'inherit' });

const distHtmlPath = path.join(rootDir, 'dist', 'index.html');
if (!fs.existsSync(distHtmlPath)) {
  console.error('[Packer] Error: dist/index.html not found!');
  process.exit(1);
}

console.log('[Packer] Step 2: Reading and base64-encoding all 3D aircraft and ordnance models...');
const f16Path = path.join(rootDir, 'public', 'models', 'jets', 'F-16.glb');
const typhoonPath = path.join(rootDir, 'public', 'models', 'jets', 'TyphoonOne.glb');
const rapidPath = path.join(rootDir, 'public', 'models', 'fighter-jet', 'source', 'RapidShadow.fbx');
const mslPath = path.join(rootDir, 'public', 'models', 'missile', 'source', 'rocket2.fbx');

console.log(' - Encoding F-16 Fighting Falcon GLB...');
const f16B64 = fs.readFileSync(f16Path).toString('base64');
console.log(' - Encoding Eurofighter Typhoon GLB...');
const typhoonB64 = fs.readFileSync(typhoonPath).toString('base64');
console.log(' - Encoding Rapid Shadow FBX...');
const rapidB64 = fs.readFileSync(rapidPath).toString('base64');
console.log(' - Encoding AIM-9 Sidewinder Missile FBX...');
const mslB64 = fs.readFileSync(mslPath).toString('base64');

console.log('[Packer] Step 3: Injecting base64 models into standalone HTML...');
let html = fs.readFileSync(distHtmlPath, 'utf8');

const injection = `
  <script>
    window.__EMBEDDED_MODELS__ = {
      f16: "data:model/gltf-binary;base64,${f16B64}",
      typhoon: "data:model/gltf-binary;base64,${typhoonB64}",
      rapidshadow: "data:application/octet-stream;base64,${rapidB64}",
      missile: "data:application/octet-stream;base64,${mslB64}"
    };
    console.log('[Standalone] All 4 combat aircraft and ordnance 3D models embedded in memory!');
  </script>
`;

html = html.replace('</head>', `${injection}\n</head>`);

const outPath = path.join(rootDir, 'flight-sim-3d.html');
fs.writeFileSync(outPath, html, 'utf8');
const mb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`[Packer] SUCCESS! Created complete self-contained standalone file: flight-sim-3d.html (${mb} MB)`);
