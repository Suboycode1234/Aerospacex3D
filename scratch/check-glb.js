import * as fs from 'fs';

function checkGlb(path) {
  const buf = fs.readFileSync(path);
  const magic = buf.toString('utf8', 0, 4);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonChunkType = buf.toString('utf8', 16, 20);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonStr);

  console.log(`=== ${path} ===`);
  console.log('Magic:', magic, 'Version:', version, 'Length:', (length/1024/1024).toFixed(2), 'MB');
  console.log('Extensions Used:', gltf.extensionsUsed || 'None');
  console.log('Extensions Required:', gltf.extensionsRequired || 'None');
  console.log('Nodes count:', gltf.nodes ? gltf.nodes.length : 0);
  console.log('Meshes count:', gltf.meshes ? gltf.meshes.length : 0);
  console.log('Materials count:', gltf.materials ? gltf.materials.length : 0);
  console.log('Images count:', gltf.images ? gltf.images.length : 0);
}

checkGlb('public/models/jets/F-16.glb');
checkGlb('public/models/jets/TyphoonOne.glb');
