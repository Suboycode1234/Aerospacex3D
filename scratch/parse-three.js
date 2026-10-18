import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const buf = fs.readFileSync('public/models/jets/F-16.glb');
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

loader.parse(arrayBuf, '', (gltf) => {
  const model = gltf.scene;
  const bbox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  console.log('F-16 bbox size:', size);
  console.log('F-16 bbox center:', center);

  let meshes = 0;
  model.traverse(c => {
    if (c.isMesh) {
      meshes++;
      console.log(`Mesh: ${c.name}, visible: ${c.visible}, material: ${c.material ? c.material.type : 'none'}`);
    }
  });
  console.log('Total meshes found:', meshes);
}, (err) => {
  console.error('Parse error:', err);
});
