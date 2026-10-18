import * as fs from 'fs';

const buf = fs.readFileSync('public/models/jets/F-16.glb');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

console.log('Accessors count:', gltf.accessors.length);
// Print min/max for position accessors
gltf.accessors.forEach((acc, i) => {
  if (acc.type === 'VEC3' && acc.min && acc.max) {
    console.log(`Accessor ${i}: min=[${acc.min.map(n=>n.toFixed(2))}], max=[${acc.max.map(n=>n.toFixed(2))}]`);
  }
});
