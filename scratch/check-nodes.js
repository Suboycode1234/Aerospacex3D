import * as fs from 'fs';

function checkNodes(path) {
  const buf = fs.readFileSync(path);
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonStr);

  console.log(`=== NODES IN ${path} ===`);
  gltf.nodes.forEach((n, i) => {
    console.log(`Node ${i}: "${n.name}", mesh: ${n.mesh}, children: ${JSON.stringify(n.children)}`);
  });
}

checkNodes('public/models/jets/F-16.glb');
