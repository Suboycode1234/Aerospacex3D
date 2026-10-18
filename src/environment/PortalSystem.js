import * as THREE from 'three';

// Procedural Sci-Fi Quantum Warp Gate & Portal System
export class PortalSystem {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;

    this.portals = [];
    this.activeWarp = false;
    this.warpProgress = 0;
    this.onWarpTriggered = null;

    // 1. Hostile Airspace Jump Gate (In Runway 36 departure climb corridor)
    // Runway extends along Z to -1600. Portal floats in climb corridor at Z = -2800, Y = 240m
    this.jumpGate = this.createPortal({
      id: 'jump-to-combat',
      position: new THREE.Vector3(0, 240, -2800),
      targetAirspace: 'HOSTILE_AIRSPACE',
      targetPosition: new THREE.Vector3(0, 550, -10400), // Fly in over Hostile Island 2 heading South
      themeColor: 0x00e5ff, // Electric Cyan / Neon Blue
      pulseColor: 0x88f5ff,
      radius: 110,
      label: 'COMBAT AIRSPACE JUMP GATE',
    });

    // 2. Home Airbase Extraction Gate - GROUND LEVEL on Hostile Island 2
    // Sits directly on Runway 36 pavement at Z = -6700, elevation Y = 105 (bottom touches ground at Y = 38m)
    this.homeGate = this.createPortal({
      id: 'jump-to-home',
      position: new THREE.Vector3(0, 105, -6700),
      targetAirspace: 'HOME_BASE',
      targetPosition: new THREE.Vector3(0, 500, 2400), // Approach heading aligned to Home Base Runway 36
      themeColor: 0xffaa00, // Golden Amber / Solar Flare
      pulseColor: 0xffe077,
      radius: 110, // Full-scale stargate ring
      label: 'GROUND EXTRACTION GATE',
      isGroundLevel: true,
    });

    // Both portals added to scene
    this.portals.push(this.jumpGate);
    this.portals.push(this.homeGate);
  }

  createPortal(config) {
    const group = new THREE.Group();
    group.position.copy(config.position);
    group.userData = { ...config };

    const radius = config.radius;
    const themeCol = new THREE.Color(config.themeColor);

    // A. Massive Outer Heavy Alloy Stargate Ring
    const outerRingGeo = new THREE.TorusGeometry(radius, 8.5, 16, 48);
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      metalness: 0.85,
      roughness: 0.25,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    group.add(outerRing);

    // Ground-Level Reinforced Runway Pedestal Foundation
    if (config.isGroundLevel) {
      const pFoundationGeo = new THREE.BoxGeometry(radius * 2.2, 18, 36);
      const pFoundationMat = new THREE.MeshStandardMaterial({
        color: 0x333b47,
        roughness: 0.85,
        metalness: 0.3,
      });
      const foundation = new THREE.Mesh(pFoundationGeo, pFoundationMat);
      foundation.position.set(0, -radius + 6, 0);
      group.add(foundation);
    }

    // B. Concentric Inner Energy Coil 1 (Clockwise Rotation)
    const coil1Geo = new THREE.TorusGeometry(radius * 0.86, 3.2, 8, 36);
    const coil1Mat = new THREE.MeshStandardMaterial({
      color: config.themeColor,
      emissive: config.themeColor,
      emissiveIntensity: 1.6,
      roughness: 0.1,
      metalness: 0.9,
    });
    const coil1 = new THREE.Mesh(coil1Geo, coil1Mat);
    coil1.name = 'Coil1';
    group.add(coil1);

    // C. Concentric Inner Energy Coil 2 (Counter-Clockwise Rotation)
    const coil2Geo = new THREE.TorusGeometry(radius * 0.72, 2.8, 8, 32);
    const coil2Mat = new THREE.MeshStandardMaterial({
      color: config.pulseColor,
      emissive: config.pulseColor,
      emissiveIntensity: 2.0,
      roughness: 0.1,
      metalness: 0.9,
    });
    const coil2 = new THREE.Mesh(coil2Geo, coil2Mat);
    coil2.name = 'Coil2';
    group.add(coil2);

    // D. 8 Magnetic Emitter Stabilizer Pylons around perimeter
    const pylonGeo = new THREE.BoxGeometry(6, 28, 14);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      metalness: 0.7,
      roughness: 0.3,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      pylon.rotation.z = angle + Math.PI / 2;
      group.add(pylon);

      // Glowing Pylon Tip Emitter
      const tipGeo = new THREE.SphereGeometry(3.5, 8, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color: config.pulseColor });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(Math.cos(angle) * (radius + 12), Math.sin(angle) * (radius + 12), 0);
      group.add(tip);
    }

    // E. Shimmering Event Horizon Vortex (Double-sided planar portal disc)
    const horizonGeo = new THREE.CircleGeometry(radius * 0.71, 48);
    const vortexTexture = this.createVortexCanvas(config.themeColor);
    const horizonMat = new THREE.MeshBasicMaterial({
      map: vortexTexture,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    horizon.name = 'Horizon';
    group.add(horizon);

    // F. Singularity Core Light
    const coreLight = new THREE.PointLight(config.themeColor, 4.0, radius * 8.0, 1.2);
    coreLight.name = 'CoreLight';
    group.add(coreLight);

    // G. Vertical Skyward Ion Guidance Beam (visible from miles away across island)
    const beamGeo = new THREE.CylinderGeometry(4.0, 12.0, 4200, 12, 1, true);
    beamGeo.translate(0, 2100, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: config.themeColor,
      transparent: true,
      opacity: 0.40,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'IonBeam';
    group.add(beam);

    // H. Swirling Event Horizon Inflow Particles
    const particleCount = 180;
    const pGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(particleCount * 3);
    const pData = [];

    for (let i = 0; i < particleCount; i++) {
      const pAngle = Math.random() * Math.PI * 2;
      const pDist = radius * (0.3 + Math.random() * 0.85);
      const pZ = (Math.random() - 0.5) * 50;
      posArr[i * 3] = Math.cos(pAngle) * pDist;
      posArr[i * 3 + 1] = Math.sin(pAngle) * pDist;
      posArr[i * 3 + 2] = pZ;

      pData.push({
        angle: pAngle,
        dist: pDist,
        speed: 1.2 + Math.random() * 2.2,
        maxDist: radius * 1.15,
      });
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const pMat = new THREE.PointsMaterial({
      color: config.pulseColor,
      size: 4.5,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    particles.name = 'Particles';
    particles.userData = { pData };
    group.add(particles);

    this.scene.add(group);
    return group;
  }

  createVortexCanvas(colorHex) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    const col = new THREE.Color(colorHex);
    const r = Math.round(col.r * 255);
    const g = Math.round(col.g * 255);
    const b = Math.round(col.b * 255);

    // Concentric swirling luminous plasma rings
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cx - 10);
    grad.addColorStop(0.0, '#ffffff');
    grad.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, 0.95)`);
    grad.addColorStop(0.65, `rgba(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)}, 0.55)`);
    grad.addColorStop(0.92, `rgba(${r}, ${g}, ${b}, 0.85)`);
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Spiral accretion arms
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    for (let arm = 0; arm < 6; arm++) {
      ctx.beginPath();
      const startAngle = (arm / 6) * Math.PI * 2;
      for (let step = 0; step < 60; step++) {
        const theta = startAngle + (step * 0.12);
        const radius = step * 3.6;
        const px = cx + Math.cos(theta) * radius;
        const py = cy + Math.sin(theta) * radius;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  update(dt, playerPosition, currentAirspace) {
    // 1. Animate all portal components (rings, energy coils, vortex, particles)
    for (const portal of this.portals) {
      // Both portals are permanently active physical landmarks in the world
      portal.visible = true;

      const coil1 = portal.getObjectByName('Coil1');
      if (coil1) coil1.rotation.z += 1.2 * dt;

      const coil2 = portal.getObjectByName('Coil2');
      if (coil2) coil2.rotation.z -= 1.8 * dt;

      const horizon = portal.getObjectByName('Horizon');
      if (horizon) horizon.rotation.z += 0.8 * dt;

      const coreLight = portal.getObjectByName('CoreLight');
      if (coreLight) {
        coreLight.intensity = 3.5 + Math.sin(performance.now() * 0.008) * 1.5;
      }

      const beam = portal.getObjectByName('IonBeam');
      if (beam) {
        beam.material.opacity = 0.35 + Math.sin(performance.now() * 0.005) * 0.15;
      }

      // Swirl inward particles
      const particles = portal.getObjectByName('Particles');
      if (particles && particles.geometry && particles.userData.pData) {
        const posAttr = particles.geometry.attributes.position;
        const pData = particles.userData.pData;
        const count = pData.length;

        for (let i = 0; i < count; i++) {
          const item = pData[i];
          item.angle += item.speed * dt;
          item.dist -= 35 * dt;

          if (item.dist < 15) {
            item.dist = item.maxDist;
          }

          posAttr.setXY(
            i,
            Math.cos(item.angle) * item.dist,
            Math.sin(item.angle) * item.dist
          );
        }
        posAttr.needsUpdate = true;
      }

      // 2. Generous Volumetric Collision Check: Player flies into or through portal ring
      if (playerPosition && !this.activeWarp) {
        // Prevent triggering the portal in current airspace that wouldn't make sense
        const isEligible = (currentAirspace === 'HOME_BASE' && portal === this.jumpGate) ||
                           (currentAirspace === 'HOSTILE_AIRSPACE' && portal === this.homeGate);
        if (!isEligible) continue;

        const dx = playerPosition.x - portal.position.x;
        const dy = playerPosition.y - portal.position.y;
        const dz = playerPosition.z - portal.position.z;
        const radialDist = Math.hypot(dx, dy); // distance from ring axis in XY plane
        const axialDist = Math.abs(dz);        // distance along flight path axis Z
        const dist3D = Math.hypot(dx, dy, dz);

        // Volumetric gate detection: passing through the ring (radial < 170m & axial < 140m) OR within 190m sphere
        if ((radialDist < portal.userData.radius * 1.55 && axialDist < 140) || dist3D < 190) {
          this.executeWarp(portal);
        }
      }
    }
  }

  executeWarp(portal) {
    this.activeWarp = true;
    console.log(`[Portal] Initiating Hyperspace Jump to ${portal.userData.targetAirspace}!`);

    if (this.sound && this.sound.playWarpJump) {
      this.sound.playWarpJump();
    }

    if (this.onWarpTriggered) {
      this.onWarpTriggered({
        sourcePortal: portal,
        targetAirspace: portal.userData.targetAirspace,
        targetPosition: portal.userData.targetPosition.clone(),
      });
    }

    // Cooldown lockout so warp doesn't double-trigger
    setTimeout(() => {
      this.activeWarp = false;
    }, 1200);
  }

  // Get current active portal for HUD waypoint tracking
  getActivePortal(currentAirspace) {
    if (currentAirspace === 'HOME_BASE') {
      return this.jumpGate;
    }
    return this.homeGate;
  }
}
