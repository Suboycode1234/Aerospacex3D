import * as THREE from 'three';
import { BakedLightingSystem } from './BakedLightingSystem.js';
import { PortalSystem } from './PortalSystem.js';

// 3D Environment: Sky, Ocean, Mountain Islands, Runway Airbase, and Clouds
export class World {
  constructor(scene, renderer, sound = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.sound = sound;

    // Baked Raytracing & Time-of-Day Dual Lightmap System (Zero Hardware Cost)
    this.bakedLighting = new BakedLightingSystem(scene, renderer);

    this.setupLighting();
    this.setupSky();
    this.setupOcean();
    this.setupTerrainAndAirbase();
    this.setupClouds();

    // Quantum Warp Gate & Portal System (Home Base <-> Hostile Combat Sector)
    this.portalSystem = new PortalSystem(this.scene, this.sound);
  }

  setupLighting() {
    // Ambient light simulating sky bounce
    this.ambientLight = new THREE.AmbientLight(0xb0d4ff, 1.0);
    this.scene.add(this.ambientLight);

    // Main Sun Light
    this.sunLight = new THREE.DirectionalLight(0xfff7ea, 2.2);
    this.sunLight.position.set(4000, 7000, 3000);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 100;
    this.sunLight.shadow.camera.far = 15000;
    const d = 1500;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // Ground bounce fill light
    this.fillLight = new THREE.DirectionalLight(0xa5cbf5, 1.2);
    this.fillLight.position.set(-3000, 2000, -2000);
    this.scene.add(this.fillLight);

    // Hemisphere light for natural sky/ground gradient
    this.hemiLight = new THREE.HemisphereLight(0xd4eaff, 0x3d4e3a, 0.9);
    this.scene.add(this.hemiLight);
  }

  setupSky() {
    // Beautiful atmospheric blue sky background
    const skyColor = new THREE.Color(0x6aa2d8);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x8ebae5, 0.000028);

    // Atmospheric Sky Dome with horizon gradient
    const skyGeo = new THREE.SphereGeometry(35000, 32, 24);
    skyGeo.scale(-1, 1, 1);

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;
        
        vec3 zenithColor = vec3(0.08, 0.28, 0.65); // Deep high altitude sky
        vec3 midColor = vec3(0.35, 0.62, 0.88);    // Rich daylight sky
        vec3 horizonColor = vec3(0.75, 0.86, 0.96);// Soft horizon haze
        
        vec3 col = mix(midColor, zenithColor, max(0.0, pow(max(0.0, h), 0.7)));
        if (h < 0.25) {
          col = mix(horizonColor, col, max(0.0, h / 0.25));
        }
        
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);
  }

  setupOcean() {
    // Ocean Plane
    const oceanGeo = new THREE.PlaneGeometry(60000, 60000, 64, 64);
    oceanGeo.rotateX(-Math.PI / 2);

    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x09283d,
      roughness: 0.15,
      metalness: 0.7,
      flatShading: true,
    });

    this.ocean = new THREE.Mesh(oceanGeo, oceanMat);
    this.ocean.position.y = 0;
    this.ocean.receiveShadow = true;
    this.scene.add(this.ocean);
  }

  createLushIslandTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    // 1. Base vibrant emerald / forest green grass gradient
    const grassGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 490);
    grassGrad.addColorStop(0.0, '#38a82c');  // Bright lush meadow green
    grassGrad.addColorStop(0.35, '#2e9624'); // Vibrant emerald grass
    grassGrad.addColorStop(0.75, '#22781a'); // Rich tropical foliage
    grassGrad.addColorStop(0.91, '#8c7a42'); // Shoreline transition
    grassGrad.addColorStop(1.0, '#dec88a');  // Golden sandy beach border
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 0, size, size);

    // 2. High-frequency organic grass texture noise & meadow variation
    for (let i = 0; i < 500; i++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const dist = Math.hypot(rx - cx, ry - cy);
      if (dist < 475) {
        const radius = 8 + Math.random() * 35;
        const isBright = Math.random() > 0.45;
        ctx.fillStyle = isBright ? 'rgba(78, 168, 62, 0.22)' : 'rgba(24, 60, 18, 0.28)';
        ctx.beginPath();
        ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Clear green taxiway & runway perimeter lawns
    ctx.fillStyle = 'rgba(55, 125, 45, 0.50)';
    ctx.fillRect(cx - 70, 40, 140, size - 80);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  createHostileIslandTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    // 1. Dark volcanic / scorched tactical island ground
    const grad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 490);
    grad.addColorStop(0.0, '#2d2824');  // Charcoal / dark volcanic stone
    grad.addColorStop(0.35, '#3b3229'); // Dark tactical camouflage soil
    grad.addColorStop(0.70, '#26201a'); // Scorched earth
    grad.addColorStop(0.90, '#1c1712'); // Dark basalt perimeter
    grad.addColorStop(1.0, '#120e0b');  // Deep volcanic rock
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // 2. High-frequency scorched texture noise & crater marks
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const dist = Math.hypot(rx - cx, ry - cy);
      if (dist < 475) {
        const radius = 6 + Math.random() * 30;
        const isDark = Math.random() > 0.35;
        ctx.fillStyle = isDark ? 'rgba(15, 12, 10, 0.45)' : 'rgba(80, 50, 30, 0.25)';
        ctx.beginPath();
        ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Runway apron & scorched blast areas
    ctx.fillStyle = 'rgba(25, 20, 18, 0.65)';
    ctx.fillRect(cx - 70, 40, 140, size - 80);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  buildIslandAirbase({ centerZ, isHostile }) {
    const group = new THREE.Group();
    group.position.set(0, 0, centerZ);

    // 1. Military Airbase Island Ground Disk
    const islandGeo = new THREE.CircleGeometry(3200, 64);
    islandGeo.rotateX(-Math.PI / 2);
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: isHostile ? this.createHostileIslandTexture() : this.createLushIslandTexture(),
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, 37.5, 0);
    island.receiveShadow = true;
    group.add(island);

    // Rocky Shoreline / Island Cliffs
    const cliffGeo = new THREE.CylinderGeometry(3200, 3800, 42, 64, 1, true);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x221c17 : 0x3d352c,
      roughness: 0.95,
      metalness: 0.1,
    });
    const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    cliffMesh.position.set(0, 16.5, 0);
    cliffMesh.receiveShadow = true;
    group.add(cliffMesh);

    // Trees
    const treeGroup = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(1.6, 2.6, 16, 6);
    trunkGeo.translate(0, 8, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x241a12 : 0x422c18,
      roughness: 0.9,
    });

    const foliageGeo = new THREE.ConeGeometry(8.5, 24, 7);
    foliageGeo.translate(0, 24, 0);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x362c1d : 0x226b28,
      roughness: 0.72,
      flatShading: true,
    });

    for (let i = 0; i < 220; i++) {
      const angle = (i / 220) * Math.PI * 2 + (Math.sin(i * 99) * 0.4);
      const dist = 220 + (Math.abs(Math.sin(i * 47)) * 2100);
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;

      if (Math.abs(tx) < 160 && Math.abs(tz) < 1750) continue;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.castShadow = true;
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      tree.add(trunk);
      tree.add(foliage);

      const s = 0.75 + (i % 5) * 0.18;
      tree.scale.set(s, s * 1.0, s);
      tree.position.set(tx, 37.5, tz);
      treeGroup.add(tree);
    }
    group.add(treeGroup);

    // 2. Airbase Runway
    const runwayGeo = new THREE.PlaneGeometry(160, 3200);
    runwayGeo.rotateX(-Math.PI / 2);
    const runwayMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x14161a : 0x181a1e,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.position.set(0, 37.8, 0);
    runway.receiveShadow = true;
    group.add(runway);

    // Centerline Stripes
    for (let z = -1400; z <= 1400; z += 120) {
      const stripeGeo = new THREE.PlaneGeometry(4, 60);
      stripeGeo.rotateX(-Math.PI / 2);
      const stripeMat = new THREE.MeshBasicMaterial({ color: isHostile ? 0xcc9966 : 0xffffff });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 38.3, z);
      group.add(stripe);
    }

    // Runway Threshold Numbers ("36" and "18")
    const numGeo = new THREE.PlaneGeometry(35, 70);
    numGeo.rotateX(-Math.PI / 2);
    const numMat = new THREE.MeshBasicMaterial({ color: isHostile ? 0xcc4444 : 0xffffff });
    const numNorth = new THREE.Mesh(numGeo, numMat);
    numNorth.position.set(0, 38.4, -1450);
    group.add(numNorth);

    const numSouth = new THREE.Mesh(numGeo, numMat);
    numSouth.position.set(0, 38.4, 1450);
    group.add(numSouth);

    // Runway Edge & Threshold Lights
    const lightGroup = new THREE.Group();
    const thresholdCol = isHostile ? 0xffaa00 : 0x00ff66;
    const edgeCol = isHostile ? 0xff2244 : 0xfffaed;
    const taxiCol = isHostile ? 0xff4422 : 0x00a2ff;

    const thresholdMat = new THREE.MeshBasicMaterial({ color: thresholdCol });
    const edgeMat = new THREE.MeshBasicMaterial({ color: edgeCol });
    const taxiMat = new THREE.MeshBasicMaterial({ color: taxiCol });
    const bulbGeo = new THREE.SphereGeometry(1.2, 8, 8);

    // Threshold Bars
    for (let x = -75; x <= 75; x += 15) {
      const gNorth = new THREE.Mesh(bulbGeo, thresholdMat);
      gNorth.position.set(x, 38.6, -1590);
      lightGroup.add(gNorth);

      const gSouth = new THREE.Mesh(bulbGeo, thresholdMat);
      gSouth.position.set(x, 38.6, 1590);
      lightGroup.add(gSouth);
    }

    // Runway Edge Lights
    for (let z = -1550; z <= 1550; z += 90) {
      const edgeL = new THREE.Mesh(bulbGeo, edgeMat);
      edgeL.position.set(-82, 38.6, z);
      lightGroup.add(edgeL);

      const edgeR = new THREE.Mesh(bulbGeo, edgeMat);
      edgeR.position.set(82, 38.6, z);
      lightGroup.add(edgeR);
    }

    // Taxiway Lights
    for (let x = -85; x >= -240; x -= 20) {
      const taxiL = new THREE.Mesh(bulbGeo, taxiMat);
      taxiL.position.set(x, 38.6, 20);
      lightGroup.add(taxiL);

      const taxiR = new THREE.Mesh(bulbGeo, taxiMat);
      taxiR.position.set(x, 38.6, 180);
      lightGroup.add(taxiR);
    }
    group.add(lightGroup);

    // Airbase Buildings
    const airbaseGroup = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x333b47 : 0x687280,
      roughness: 0.85
    });

    // ATC Tower
    const towerGeo = new THREE.CylinderGeometry(8, 14, 65, 8);
    const towerMesh = new THREE.Mesh(towerGeo, concreteMat);
    towerMesh.position.set(-220, 70, 100);
    towerMesh.castShadow = true;
    towerMesh.receiveShadow = true;
    airbaseGroup.add(towerMesh);

    const cabGeo = new THREE.CylinderGeometry(16, 12, 12, 8);
    const cabMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x221111 : 0x112233,
      roughness: 0.1,
      metalness: 0.9,
      emissive: isHostile ? 0x661100 : 0x004466,
      emissiveIntensity: 0.5,
    });
    const cabMesh = new THREE.Mesh(cabGeo, cabMat);
    cabMesh.position.set(-220, 106, 100);
    cabMesh.castShadow = true;
    airbaseGroup.add(cabMesh);

    // Beacon
    const beaconGeo = new THREE.CylinderGeometry(2, 2, 4, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: isHostile ? 0xff2222 : 0xffffff });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(-220, 114, 100);
    airbaseGroup.add(beacon);
    if (isHostile) {
      this.hostileBeacon = beacon;
    } else {
      this.atcBeacon = beacon;
    }

    // Hangars
    const hangarGeo = new THREE.CylinderGeometry(35, 35, 90, 16, 1, false, 0, Math.PI);
    hangarGeo.rotateZ(Math.PI / 2);
    const hangarMat = new THREE.MeshStandardMaterial({
      color: isHostile ? 0x282e38 : 0x374151,
      metalness: 0.7,
      roughness: 0.4,
    });
    [-250, 120, 480].forEach(zPos => {
      const hangar = new THREE.Mesh(hangarGeo, hangarMat);
      hangar.position.set(-340, 37.8, zPos);
      hangar.castShadow = true;
      hangar.receiveShadow = true;
      airbaseGroup.add(hangar);
    });

    // Coastal Radar
    const domeGeo = new THREE.SphereGeometry(22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshStandardMaterial({ color: isHostile ? 0x475569 : 0xf1f5f9, roughness: 0.35 });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(340, 37.8, 300);
    dome.castShadow = true;
    airbaseGroup.add(dome);

    const dishPedestal = new THREE.CylinderGeometry(3, 4, 15, 8);
    const dishBase = new THREE.Mesh(dishPedestal, concreteMat);
    dishBase.position.set(340, 67, 300);
    airbaseGroup.add(dishBase);

    const dishGeo = new THREE.CylinderGeometry(14, 3, 4, 12, 1, true);
    dishGeo.rotateZ(Math.PI / 2);
    const dishMat = new THREE.MeshStandardMaterial({ color: isHostile ? 0x64748b : 0x94a3b8, metalness: 0.8 });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(340, 75, 300);
    airbaseGroup.add(dish);
    if (isHostile) {
      this.hostileRadarDish = dish;
    } else {
      this.radarDish = dish;
    }

    group.add(airbaseGroup);
    return group;
  }

  setupTerrainAndAirbase() {
    this.terrainGroup = new THREE.Group();

    // 1. Home Base Starting Island (Zero enemies, peaceful aerodrome)
    const homeIsland = this.buildIslandAirbase({ centerZ: 0, isHostile: false });
    this.terrainGroup.add(homeIsland);

    // 2. Hostile Forward Operating Island (Combat Sector airfield with ground-level warp portal)
    const hostileIsland = this.buildIslandAirbase({ centerZ: -8200, isHostile: true });
    this.terrainGroup.add(hostileIsland);

    // 3. Surrounding Archipelago Islands & Mountain Ranges
    const mountainColors = [0x2f5233, 0x3d6640, 0x48774c, 0x27462a];
    const islandPositions = [
      { x: -5500, z: -4000, r: 2400, h: 650 },
      { x: 6500, z: -5000, r: 3200, h: 900 },
      { x: -7000, z: 6000, r: 2800, h: 780 },
      { x: 8000, z: 5000, r: 3500, h: 1100 },
      { x: 1000, z: -12500, r: 2600, h: 820 },
      { x: -2000, z: 10000, r: 3000, h: 950 },
    ];

    for (const data of islandPositions) {
      const mtnGeo = new THREE.ConeGeometry(data.r, data.h, 16);
      const mtnMat = new THREE.MeshStandardMaterial({
        color: mountainColors[Math.floor(Math.random() * mountainColors.length)],
        roughness: 0.88,
        flatShading: true,
      });
      const mountain = new THREE.Mesh(mtnGeo, mtnMat);
      mountain.position.set(data.x, data.h / 2 - 20, data.z);
      mountain.receiveShadow = true;
      mountain.castShadow = true;
      this.terrainGroup.add(mountain);
    }

    this.scene.add(this.terrainGroup);
    this.setupCombatBorder();
  }

  setupCombatBorder() {
    this.borderGroup = new THREE.Group();
    const radius = 3800;
    const height = 4500;

    const makeBorder = (centerZ, colorHex, hazardCol) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(0, 0, centerZ);

      // Holographic Tactical Boundary Fence Cylinder
      const borderGeo = new THREE.CylinderGeometry(radius, radius, height, 48, 12, true);
      borderGeo.translate(0, height / 2, 0);
      const borderMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      });
      const bMesh = new THREE.Mesh(borderGeo, borderMat);
      bGroup.add(bMesh);

      // Glowing Perimeter Boundary Ring on Ocean Surface
      const ringGeo = new THREE.RingGeometry(radius - 30, radius + 30, 96);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: hazardCol,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 2.5;
      bGroup.add(ringMesh);

      return { group: bGroup, mesh: bMesh };
    };

    const homeB = makeBorder(0, 0x00e5ff, 0x00ffaa);
    const hostileB = makeBorder(-8200, 0xff3355, 0xffaa00);

    this.borderMeshHome = homeB.mesh;
    this.borderMeshHostile = hostileB.mesh;

    this.borderGroup.add(homeB.group);
    this.borderGroup.add(hostileB.group);
    this.scene.add(this.borderGroup);
  }

  setupClouds() {
    this.cloudGroup = new THREE.Group();
    const cloudGeo = new THREE.DodecahedronGeometry(180, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0.75,
      flatShading: true,
    });

    // Spawn fluffy cloud deck between 1600m and 2400m
    const count = 75;
    for (let i = 0; i < count; i++) {
      const cluster = new THREE.Group();
      const cx = (Math.random() - 0.5) * 35000;
      const cz = (Math.random() - 0.5) * 35000;
      const cy = 1800 + (Math.random() - 0.5) * 500;

      // 4 to 8 puffs per cloud formation
      const puffs = 4 + Math.floor(Math.random() * 5);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 450,
          (Math.random() - 0.5) * 120,
          (Math.random() - 0.5) * 450
        );
        const scale = 0.8 + Math.random() * 1.6;
        puff.scale.set(scale * 1.5, scale * 0.7, scale * 1.3);
        cluster.add(puff);
      }

      cluster.position.set(cx, cy, cz);
      this.cloudGroup.add(cluster);
    }

    this.scene.add(this.cloudGroup);
  }

  update(playerPos, dt = 0.016, currentAirspace = 'HOME_BASE') {
    // 1. Update Master Clock & Baked Lighting / Aircraft Radiance Reflections
    if (this.bakedLighting) {
      this.bakedLighting.update(dt, this);
    }

    // 2. Subtle rotation of holographic combat perimeter barriers
    if (this.borderMeshHome) {
      this.borderMeshHome.rotation.y += 0.04 * dt;
    }
    if (this.borderMeshHostile) {
      this.borderMeshHostile.rotation.y -= 0.04 * dt;
    }

    // 3. Keep sun shadow target centered on player for crisp dynamic shadows
    if (playerPos && this.sunLight) {
      this.sunLight.target.position.copy(playerPos);
      this.sunLight.target.updateMatrixWorld();
    }

    // 4. Update Quantum Warp Gate & Portal System
    if (this.portalSystem) {
      this.portalSystem.update(dt, playerPos, currentAirspace);
    }

    // 5. Animate ATC aerodrome beacons & radar sweeps
    if (this.atcBeacon) {
      this.atcBeacon.rotation.y += 2.5 * dt;
    }
    if (this.hostileBeacon) {
      this.hostileBeacon.rotation.y += 2.5 * dt;
    }
    if (this.radarDish) {
      this.radarDish.rotation.y += 1.2 * dt;
    }
    if (this.hostileRadarDish) {
      this.hostileRadarDish.rotation.y += 1.2 * dt;
    }
  }
}
