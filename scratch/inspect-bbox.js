import * as fs from 'fs';

function inspectGlb(path) {
  const buf = fs.readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];

  gltf.accessors.forEach(acc => {
    if (acc.type === 'VEC3' && acc.min && acc.max) {
      for (let i = 0; i < 3; i++) {
        if (acc.min[i] < min[i]) min[i] = acc.min[i];
        if (acc.max[i] > max[i]) max[i] = acc.max[i];
      }
    }
  });

  console.log(`=== ${path} ===`);
  console.log('Overall BBox Min:', min.map(n=>n.toFixed(2)));
  console.log('Overall BBox Max:', max.map(n=>n.toFixed(2)));
  const size = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];
  console.log('Size (X, Y, Z):', size.map(n=>n.toFixed(2)));
}

inspectGlb('public/models/jets/F-16.glb');
inspectGlb('public/models/jets/TyphoonOne.glb');
