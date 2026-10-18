import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ModelLoader {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();

    // Cache of all available aircraft models
    this.planeModels = {
      'f16': null,
      'typhoon': null,
      'rapidshadow': null,
    };
    this.activePlaneType = 'f16';

    this.jetModel = null;
    this.missileModel = null;

    // User scale multiplier overrides (adjustable in settings)
    this.userJetScale = 1.0;
    this.userMissileScale = 1.0;

    // Callbacks
    this.onJetLoaded = null;
    this.onMissileLoaded = null;
  }

  // Build a sleek, highly detailed procedural stealth fighter jet
  createProceduralJet() {
    const jetGroup = new THREE.Group();
    jetGroup.name = 'Procedural_Fighter_Jet';

    // Premium military stealth dark carbon materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x242830,
      roughness: 0.35,
      metalness: 0.65,
      flatShading: false,
    });

    const cockpitMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a1420,
      metalness: 0.85,
      roughness: 0.1,
      transmission: 0.6,
      transparent: true,
      opacity: 0.85,
      reflectivity: 0.9,
    });

    const engineMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      roughness: 0.6,
      metalness: 0.9,
    });

    // 1. Fuselage
    const fuseGeo = new THREE.ConeGeometry(1.4, 15.0, 8);
    fuseGeo.rotateX(-Math.PI / 2); // Point along -Z
    fuseGeo.scale(1.2, 0.6, 1.0);
    const fuselage = new THREE.Mesh(fuseGeo, bodyMat);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    jetGroup.add(fuselage);

    // 2. Cockpit Canopy Bubble
    const canopyGeo = new THREE.SphereGeometry(0.8, 16, 12);
    canopyGeo.scale(0.7, 0.7, 2.4);
    const canopy = new THREE.Mesh(canopyGeo, cockpitMat);
    canopy.position.set(0, 0.7, -1.8);
    canopy.castShadow = true;
    jetGroup.add(canopy);

    // 3. Delta Main Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(6.5, 3.2);  // Wingtip right
    wingShape.lineTo(5.8, 4.0);  // Wingtip trailing
    wingShape.lineTo(0.6, 3.8);  // Wing root trailing
    wingShape.lineTo(-0.6, 3.8); // Wing root trailing
    wingShape.lineTo(-5.8, 4.0); // Wingtip left trailing
    wingShape.lineTo(-6.5, 3.2); // Wingtip left
    wingShape.closePath();

    const extrudeSettings = { depth: 0.14, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.05, bevelThickness: 0.05 };
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
    wingGeo.rotateX(Math.PI / 2);
    wingGeo.translate(0, 0, -1.2);
    const wings = new THREE.Mesh(wingGeo, bodyMat);
    wings.castShadow = true;
    wings.receiveShadow = true;
    jetGroup.add(wings);

    // 4. Twin Canted Vertical Stabilizers
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(1.8, 0);
    finShape.lineTo(0.9, 2.2);
    finShape.lineTo(0.1, 2.2);
    finShape.closePath();

    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false });

    // Right fin
    const rightFin = new THREE.Mesh(finGeo, bodyMat);
    rightFin.position.set(1.4, 0.4, 3.0);
    rightFin.rotation.y = -Math.PI / 2;
    rightFin.rotation.z = -0.35; // Canted outwards
    rightFin.castShadow = true;
    jetGroup.add(rightFin);

    // Left fin
    const leftFin = new THREE.Mesh(finGeo, bodyMat);
    leftFin.position.set(-1.4, 0.4, 3.0);
    leftFin.rotation.y = -Math.PI / 2;
    leftFin.rotation.z = 0.35;
    leftFin.castShadow = true;
    jetGroup.add(leftFin);

    // 5. Twin Engine Exhaust Nozzles
    const nozzleGeo = new THREE.CylinderGeometry(0.55, 0.65, 1.2, 16);
    nozzleGeo.rotateX(Math.PI / 2);

    const rightNozzle = new THREE.Mesh(nozzleGeo, engineMat);
    rightNozzle.position.set(0.85, 0, 5.8);
    jetGroup.add(rightNozzle);

    const leftNozzle = new THREE.Mesh(nozzleGeo, engineMat);
    leftNozzle.position.set(-0.85, 0, 5.8);
    jetGroup.add(leftNozzle);

    // 6. Afterburner Exhaust Flame Glow Cones
    const flameGeo = new THREE.ConeGeometry(0.5, 3.5, 12, 1, true);
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 2.0);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x33aaff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const rightFlame = new THREE.Mesh(flameGeo, flameMat);
    rightFlame.position.set(0.85, 0, 6.0);
    rightFlame.name = 'FlameRight';
    jetGroup.add(rightFlame);

    const leftFlame = new THREE.Mesh(flameGeo, flameMat);
    leftFlame.position.set(-0.85, 0, 6.0);
    leftFlame.name = 'FlameLeft';
    jetGroup.add(leftFlame);

    return jetGroup;
  }

  // Build procedural air-to-air missile
  createProceduralMissile() {
    const mslGroup = new THREE.Group();
    mslGroup.name = 'Procedural_AIM9X_Missile';

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      metalness: 0.6,
      roughness: 0.3,
    });

    const seekerMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      metalness: 0.9,
      roughness: 0.1,
    });

    const finMat = new THREE.MeshStandardMaterial({
      color: 0x444850,
      metalness: 0.7,
      roughness: 0.4,
    });

    // 1. Rocket Body Tube
    const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.8, 16);
    bodyGeo.rotateX(Math.PI / 2); // Orient along Z axis
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    mslGroup.add(body);

    // 2. Optical Seeker Dome
    const seekerGeo = new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    seekerGeo.rotateX(-Math.PI / 2); // Point forward (-Z)
    seekerGeo.translate(0, 0, -1.4);
    const seeker = new THREE.Mesh(seekerGeo, seekerMat);
    mslGroup.add(seeker);

    // 3. Tail Guidance Fins (Cruciform x4)
    for (let i = 0; i < 4; i++) {
      const finGeo = new THREE.BoxGeometry(0.02, 0.5, 0.4);
      finGeo.rotateZ((i * Math.PI) / 2);
      finGeo.translate(0, 0, 1.15);
      const fin = new THREE.Mesh(finGeo, finMat);
      mslGroup.add(fin);
    }

    // 4. Forward Canard Fins
    for (let i = 0; i < 4; i++) {
      const canardGeo = new THREE.BoxGeometry(0.015, 0.32, 0.25);
      canardGeo.rotateZ((i * Math.PI) / 2 + Math.PI / 4);
      canardGeo.translate(0, 0, -0.85);
      const canard = new THREE.Mesh(canardGeo, finMat);
      mslGroup.add(canard);
    }

    return mslGroup;
  }

  loadJetFBX(url = './models/fighter-jet/source/RapidShadow.fbx', textureUrl = './models/fighter-jet/textures/TEXTURE.jpg') {
    const finalUrl = (typeof window !== 'undefined' && window.__EMBEDDED_MODELS__ && window.__EMBEDDED_MODELS__['rapidshadow'])
      ? window.__EMBEDDED_MODELS__['rapidshadow']
      : url;
    return new Promise((resolve) => {
      console.log(`[ModelLoader] Loading fighter jet FBX from ${finalUrl.startsWith('data:') ? 'embedded base64' : finalUrl}...`);

      this.fbxLoader.load(
        finalUrl,
        (fbx) => {
          console.log('[ModelLoader] Jet FBX loaded successfully! Calibrating dimensions...');

          // Load texture if available
          let texture = null;
          if (textureUrl) {
            texture = this.textureLoader.load(textureUrl);
          }

          fbx.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Raytraced-style Physically Based Material with High-Gloss Sheen & Clearcoat
              const baseMat = new THREE.MeshPhysicalMaterial({
                color: 0x9098a5, // Sleek aerospace titanium grey
                roughness: 0.22,
                metalness: 0.82,
                clearcoat: 1.0,           // Automotive / stealth aircraft clearcoat lacquer
                clearcoatRoughness: 0.08,
                reflectivity: 0.95,
                envMapIntensity: 2.2,     // Vibrant sky & sun reflections
                map: texture || null,
              });
              child.material = baseMat;
            }
          });

          // 1. Compute raw bounding box before any transforms
          fbx.position.set(0, 0, 0);
          fbx.rotation.set(0, 0, 0);
          fbx.scale.set(1, 1, 1);
          fbx.updateMatrixWorld(true);

          const rawBbox = new THREE.Box3().setFromObject(fbx);
          const rawSize = new THREE.Vector3();
          rawBbox.getSize(rawSize);
          const rawCenter = new THREE.Vector3();
          rawBbox.getCenter(rawCenter);

          console.log(`[ModelLoader] Jet raw size: X=${rawSize.x.toFixed(2)}, Y=${rawSize.y.toFixed(2)}, Z=${rawSize.z.toFixed(2)}`);

          // 2. Re-center raw FBX inside pivotGroup so center of aircraft is at (0, 0, 0)
          fbx.position.set(-rawCenter.x, -rawCenter.y, -rawCenter.z);

          const pivotGroup = new THREE.Group();
          pivotGroup.name = 'PivotGroup';
          pivotGroup.add(fbx);

          // 3. Standard fighter jet length is ~16.0 meters
          const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
          const targetScale = (16.0 / maxDim) * this.userJetScale;
          pivotGroup.scale.setScalar(targetScale);

          // 4. Orientation: RapidShadow.fbx raw orientation has the front/nose facing +Z
          // and the engine exhausts facing -Z.
          // In Three.js flight coordinate space, -Z is forward and +Z is backward.
          // Rotate 180 degrees (Math.PI) around Y so nose points forward and exhausts face backward.
          pivotGroup.rotation.set(0, Math.PI, 0);

          const wrapper = new THREE.Group();
          wrapper.name = 'Aircraft_rapidshadow';
          wrapper.add(pivotGroup);

          // 5. Add Afterburner flames to rear exhaust
          this.attachAfterburnerFlames(wrapper, 2, 7.8);

          this.planeModels['rapidshadow'] = wrapper;
          this.jetModel = wrapper;
          if (this.onJetLoaded) this.onJetLoaded(wrapper);
          resolve(wrapper);
        },
        (xhr) => {
          if (xhr.total > 0) {
            console.log(`[ModelLoader] Jet FBX ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
          }
        },
        (error) => {
          console.warn('[ModelLoader] Failed to load Jet FBX, using procedural fighter jet:', error);
          const procJet = this.createProceduralJet();
          this.planeModels['rapidshadow'] = procJet;
          this.jetModel = procJet;
          resolve(procJet);
        }
      );
    });
  }

  // Load GLB Jet (F-16, Eurofighter Typhoon)
  loadJetGLB(url, key, targetLength = 15.0) {
    const finalUrl = (typeof window !== 'undefined' && window.__EMBEDDED_MODELS__ && window.__EMBEDDED_MODELS__[key])
      ? window.__EMBEDDED_MODELS__[key]
      : url;
    return new Promise((resolve) => {
      console.log(`[ModelLoader] Loading ${key} GLB from ${finalUrl.startsWith('data:') ? 'embedded base64' : finalUrl}...`);
      this.gltfLoader.load(
        finalUrl,
        (gltf) => {
          console.log(`[ModelLoader] ${key} GLB loaded! Calibrating dimensions...`);
          const rawModel = gltf.scene;

          rawModel.traverse((child) => {
            // Hide extended landing gear for flight mode, show retracted bay covers
            const nameLower = (child.name || '').toLowerCase();
            if (nameLower.includes('landingon') || nameLower.includes('landing_on')) {
              child.visible = false;
            }
            if (nameLower.includes('landingoff') || nameLower.includes('landing_off')) {
              child.visible = true;
            }

            const isGlass = nameLower.includes('canopy') || nameLower.includes('glass') || 
                            (child.material && (child.material.name || '').toLowerCase().includes('glass'));
            if (isGlass && child.material) {
              // Ensure glass is double-sided and visible from inside the cockpit looking out
              child.material.side = THREE.DoubleSide;
              child.material.transparent = true;
              child.material.opacity = 0.32; // Slight sleek cockpit glass tint
              child.material.roughness = 0.08;
              child.material.metalness = 0.15;
              child.material.envMapIntensity = 2.8; // Specular reflections across curved bubble
              child.material.depthWrite = false;
            } else if (nameLower.includes('hud') && child.material) {
              // HUD glass collimator combiner plate
              child.material.side = THREE.DoubleSide;
              child.material.transparent = true;
              child.material.opacity = 0.65;
            } else if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.envMapIntensity = 1.8;
                if (child.material.transparent) {
                  child.material.depthWrite = false;
                }
              }
            }
          });

          // 1. Raw Bounding Box
          rawModel.position.set(0, 0, 0);
          rawModel.rotation.set(0, 0, 0);
          rawModel.scale.set(1, 1, 1);
          rawModel.updateMatrixWorld(true);

          const rawBbox = new THREE.Box3().setFromObject(rawModel);
          const rawSize = new THREE.Vector3();
          rawBbox.getSize(rawSize);
          const rawCenter = new THREE.Vector3();
          rawBbox.getCenter(rawCenter);

          console.log(`[ModelLoader] ${key} raw size: X=${rawSize.x.toFixed(2)}, Y=${rawSize.y.toFixed(2)}, Z=${rawSize.z.toFixed(2)}`);

          // 2. Re-center raw model inside pivotGroup
          rawModel.position.set(-rawCenter.x, -rawCenter.y, -rawCenter.z);

          const pivotGroup = new THREE.Group();
          pivotGroup.name = 'PivotGroup';
          pivotGroup.add(rawModel);

          // 3. Scale to realistic aircraft dimensions
          const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
          const targetScale = (targetLength / maxDim) * this.userJetScale;
          pivotGroup.scale.setScalar(targetScale);

          // 4. Orientation: In Three.js parsed GLTF scene:
          // +X is Nose (forward), +Y is Canopy (up), +Z is Right wing
          // To align to Three.js coordinate system (-Z = forward, +Y = up, +X = right):
          // Rotate 90 degrees around Y: (+X -> -Z, +Y -> +Y, +Z -> +X)
          pivotGroup.rotation.set(0, Math.PI / 2, 0);

          const wrapper = new THREE.Group();
          wrapper.name = `Aircraft_${key}`;
          wrapper.add(pivotGroup);

          // 5. Attach Afterburner flames
          const tailZ = (targetLength * 0.5) * 0.98;
          this.attachAfterburnerFlames(wrapper, key === 'typhoon' ? 2 : 1, tailZ);

          this.planeModels[key] = wrapper;
          resolve(wrapper);
        },
        undefined,
        (err) => {
          console.warn(`[ModelLoader] Failed to load ${key} GLB:`, err);
          const proc = this.createProceduralJet();
          this.planeModels[key] = proc;
          resolve(proc);
        }
      );
    });
  }

  attachAfterburnerFlames(wrapper, nozzleCount = 1, tailZ = 7.5) {
    const flameGeo = new THREE.ConeGeometry(0.45, 3.6, 12, 1, true);
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 1.8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x33aaff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    if (nozzleCount === 2) {
      const flameR = new THREE.Mesh(flameGeo, flameMat);
      flameR.name = 'FlameRight';
      flameR.position.set(0.70, 0, tailZ);
      wrapper.add(flameR);

      const flameL = new THREE.Mesh(flameGeo, flameMat.clone());
      flameL.name = 'FlameLeft';
      flameL.position.set(-0.70, 0, tailZ);
      wrapper.add(flameL);
    } else {
      const flameC = new THREE.Mesh(flameGeo, flameMat);
      flameC.name = 'FlameLeft';
      flameC.position.set(0, 0, tailZ);
      wrapper.add(flameC);

      const flameR = new THREE.Mesh(flameGeo, flameMat.clone());
      flameR.name = 'FlameRight';
      flameR.position.set(0, 0, tailZ);
      wrapper.add(flameR);
    }
  }

  // Load User's FBX Missile
  loadMissileFBX(url = './models/missile/source/rocket2.fbx', textureUrl = './models/missile/textures/rocket2_body_BaseColor.png') {
    const finalUrl = (typeof window !== 'undefined' && window.__EMBEDDED_MODELS__ && window.__EMBEDDED_MODELS__['missile'])
      ? window.__EMBEDDED_MODELS__['missile']
      : url;
    return new Promise((resolve) => {
      console.log(`[ModelLoader] Loading missile FBX from ${finalUrl.startsWith('data:') ? 'embedded base64' : finalUrl}...`);

      this.fbxLoader.load(
        finalUrl,
        (fbx) => {
          console.log('[ModelLoader] Missile FBX loaded successfully! Calibrating dimensions...');

          let texture = null;
          if (textureUrl) {
            texture = this.textureLoader.load(textureUrl);
          }

          fbx.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              const mslMat = new THREE.MeshStandardMaterial({
                color: 0xd8dde4,
                roughness: 0.35,
                metalness: 0.6,
                map: texture || null,
              });
              child.material = mslMat;
            }
          });

          // 1. Raw Bounding Box
          fbx.position.set(0, 0, 0);
          fbx.rotation.set(0, 0, 0);
          fbx.scale.set(1, 1, 1);
          fbx.updateMatrixWorld(true);

          const rawBbox = new THREE.Box3().setFromObject(fbx);
          const rawSize = new THREE.Vector3();
          rawBbox.getSize(rawSize);
          const rawCenter = new THREE.Vector3();
          rawBbox.getCenter(rawCenter);

          // 2. Re-center raw missile inside pivotGroup
          fbx.position.set(-rawCenter.x, -rawCenter.y, -rawCenter.z);

          const pivotGroup = new THREE.Group();
          pivotGroup.name = 'PivotGroup';
          pivotGroup.add(fbx);

          // 3. Target scale for ~3.0m air-to-air missile
          const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
          const targetScale = (3.0 / maxDim) * this.userMissileScale;
          pivotGroup.scale.setScalar(targetScale);

          // 4. Orientation: in rocket2.fbx, -Y is nose, +Y is tail exhaust
          // To point nose along -Z, rotate X by +90 deg
          pivotGroup.rotation.x = Math.PI / 2;

          const wrapper = new THREE.Group();
          wrapper.name = 'Missile_rocket2';
          wrapper.add(pivotGroup);

          this.missileModel = wrapper;
          if (this.onMissileLoaded) this.onMissileLoaded(wrapper);
          resolve(wrapper);
        },
        undefined,
        (error) => {
          console.warn('[ModelLoader] Failed to load Missile FBX, using procedural missile:', error);
          const procMsl = this.createProceduralMissile();
          this.missileModel = procMsl;
          resolve(procMsl);
        }
      );
    });
  }

  // Clone a fresh instance of the jet
  getJetInstance(type = null) {
    const key = type || this.activePlaneType || 'f16';
    if (this.planeModels && this.planeModels[key]) {
      return this.planeModels[key].clone(true);
    }
    if (this.jetModel) {
      return this.jetModel.clone(true);
    }
    return this.createProceduralJet();
  }

  // Clone a fresh instance of the missile
  getMissileInstance() {
    if (this.missileModel) {
      return this.missileModel.clone(true);
    }
    return this.createProceduralMissile();
  }
}
