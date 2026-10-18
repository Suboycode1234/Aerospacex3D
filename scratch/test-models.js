import * as fs from 'fs';

console.log('Testing model file existence and readability:');
const paths = [
  'public/models/jets/F-16.glb',
  'public/models/jets/TyphoonOne.glb',
  'public/models/fighter-jet/source/RapidShadow.fbx',
  'models/jets/F-16.glb',
  'models/jets/TyphoonOne.glb',
  'models/fighter-jet/source/RapidShadow.fbx'
];

for (const p of paths) {
  try {
    const stats = fs.statSync(p);
    console.log(`[OK] ${p} -> ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } catch (err) {
    console.error(`[FAIL] ${p} -> ${err.message}`);
  }
}
