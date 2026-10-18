import * as THREE from 'three';
import { FlightModel } from '../physics/FlightModel.js';

// Player Aircraft Entity
export class Airplane {
  constructor(scene, modelLoader) {
    this.scene = scene;
    this.modelLoader = modelLoader;

    // Aerodynamic Physics
    this.physics = new FlightModel();

    // Health & Combat state
    this.health = 100;
    this.maxHealth = 100;
    this.crashed = false;
    this.isSmoking = false;

    // 3D Mesh
    this.mesh = this.modelLoader.getJetInstance();
    this.scene.add(this.mesh);

    // Camera view mounts - First-person cockpit placed directly inside canopy behind HUD
    this.cockpitMounts = {
      f16: new THREE.Vector3(0, 0.92, -3.15),       // Forward inside F-16 canopy
      typhoon: new THREE.Vector3(0, 1.05, -3.85),   // Forward inside Typhoon canopy
      rapidshadow: new THREE.Vector3(0, 0.88, -1.65),// Forward inside stealth cockpit
      default: new THREE.Vector3(0, 0.92, -3.15),
    };
    this.cockpitMount = this.cockpitMounts['f16'].clone();
    this.chaseMount = new THREE.Vector3(0, 2.3, 9.0);     // Zoomed in closer behind jet
    this.flybyMount = new THREE.Vector3(0, 20, 0);

    // Wingtip Vapor Trails
    this.setupVaporTrails();

    // Damage Smoke
    this.setupDamageSmoke();
  }

  setAircraftModel(type) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
    }
    this.mesh = this.modelLoader.getJetInstance(type);
    if (this.physics && this.physics.position) {
      this.mesh.position.copy(this.physics.position);
      this.mesh.quaternion.copy(this.physics.quaternion);
    }
    this.scene.add(this.mesh);
    this.setupVaporTrails();
    this.setupAirbrakeFlap();

    // Dynamically adjust cockpit mount to match airframe canopy
    const mount = this.cockpitMounts[type] || this.cockpitMounts.default;
    this.cockpitMount.copy(mount);
  }

  setupAirbrakeFlap() {
    // Aerodynamic dorsal airbrake flap on upper fuselage
    const flapGeo = new THREE.BoxGeometry(1.4, 0.08, 1.8);
    flapGeo.translate(0, 0.04, -0.9); // Pivot at front edge
    const flapMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      metalness: 0.8,
      roughness: 0.35,
    });
    const flap = new THREE.Mesh(flapGeo, flapMat);
    flap.position.set(0, 0.95, 0.6);
    flap.name = 'AirbrakeFlap';
    this.mesh.add(flap);
  }

  get position() {
    return this.physics.position;
  }

  get velocity() {
    return this.physics.velocity;
  }

  get forward() {
    return this.physics.forward;
  }

  get up() {
    return this.physics.up;
  }

  get right() {
    return this.physics.right;
  }

  get quaternion() {
    return this.physics.quaternion;
  }

  setupVaporTrails() {
    // Wingtip vapor contrail ribbons during high-G turns
    const vaporMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    const vaporGeo = new THREE.CylinderGeometry(0.08, 0.25, 6.0, 6);
    vaporGeo.rotateX(Math.PI / 2);
    vaporGeo.translate(0, 0, 3.0);

    this.vaporL = new THREE.Mesh(vaporGeo, vaporMat.clone());
    this.vaporL.position.set(-6.2, 0.1, 1.2);
    this.mesh.add(this.vaporL);

    this.vaporR = new THREE.Mesh(vaporGeo, vaporMat.clone());
    this.vaporR.position.set(6.2, 0.1, 1.2);
    this.mesh.add(this.vaporR);
  }

  setupDamageSmoke() {
    this.smokeParticles = [];
    const pGeo = new THREE.SphereGeometry(0.5, 6, 6);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.5,
    });
    this.damageSmokeGroup = new THREE.Group();

    for (let i = 0; i < 25; i++) {
      const p = new THREE.Mesh(pGeo, pMat.clone());
      p.visible = false;
      p.userData = { life: 0, maxLife: 1.5 };
      this.smokeParticles.push(p);
      this.damageSmokeGroup.add(p);
    }
    this.scene.add(this.damageSmokeGroup);
  }

  takeDamage(amount, origin = 'enemy') {
    if (this.crashed) return;
    this.health = Math.max(0, this.health - amount);

    if (this.health <= 40) {
      this.isSmoking = true;
    }

    if (this.health <= 0) {
      this.crashed = true;
      this.physics.crashed = true;
    }
  }

  update(dt) {
    if (this.crashed) {
      // In crash descent
      this.physics.velocity.y -= 20 * dt;
      this.physics.position.addScaledVector(this.physics.velocity, dt);
      this.mesh.position.copy(this.physics.position);
      this.mesh.rotation.x += 1.8 * dt;
      this.mesh.rotation.z += 2.2 * dt;
      return;
    }

    // Step 6-DOF physics
    this.physics.update(dt);

    // Sync 3D mesh
    this.mesh.position.copy(this.physics.position);
    this.mesh.quaternion.copy(this.physics.quaternion);

    // Animate Afterburner Exhaust Flames
    const flameL = this.mesh.getObjectByName('FlameLeft');
    const flameR = this.mesh.getObjectByName('FlameRight');
    const isAB = this.physics.isAfterburner;

    if (flameL && flameR) {
      flameL.visible = isAB;
      flameR.visible = isAB;
      if (isAB) {
        const pulse = 0.85 + Math.random() * 0.35;
        const abFactor = Math.max(0, (this.physics.throttle - 0.88) / 0.12);
        const boostBonus = this.physics.isBoosting ? 0.8 : 0.0;
        flameL.scale.set(1.0 + abFactor * 0.25 + boostBonus * 0.3, 1.0 + abFactor * 0.25 + boostBonus * 0.3, pulse * (1.1 + abFactor * 0.8 + boostBonus * 1.2));
        flameR.scale.set(1.0 + abFactor * 0.25 + boostBonus * 0.3, 1.0 + abFactor * 0.25 + boostBonus * 0.3, pulse * (1.1 + abFactor * 0.8 + boostBonus * 1.2));
      }
    }

    // Wingtip Condensation Vapor during high G or high AoA
    const g = this.physics.gForce;
    const isHighG = g > 4.5 || Math.abs(this.physics.aoaDeg) > 12.0;
    const vaporOpacity = isHighG ? Math.min(0.75, (g - 4.0) * 0.2 + (Math.abs(this.physics.aoaDeg) - 10) * 0.04) : 0.0;

    if (this.vaporL && this.vaporR) {
      this.vaporL.material.opacity = vaporOpacity;
      this.vaporR.material.opacity = vaporOpacity;
    }

    // Animate Visual Airbrake Flap
    const brakeFlap = this.mesh.getObjectByName('AirbrakeFlap');
    if (brakeFlap) {
      const targetAngle = this.physics.airbrake > 0 ? 0.85 : 0.0; // ~48 deg upward
      brakeFlap.rotation.x = THREE.MathUtils.lerp(brakeFlap.rotation.x, targetAngle, 14.0 * dt);
    }

    // Damage Smoke Emitter
    if (this.isSmoking) {
      const p = this.smokeParticles.find(sp => !sp.visible);
      if (p) {
        p.visible = true;
        p.position.copy(this.physics.position).addScaledVector(this.physics.forward, 3.0);
        p.userData.life = p.userData.maxLife;
        p.scale.setScalar(0.6);
      }
    }

    // Update Smoke Particles
    for (const p of this.smokeParticles) {
      if (!p.visible) continue;
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        p.visible = false;
      } else {
        const prog = 1.0 - (p.userData.life / p.userData.maxLife);
        p.scale.setScalar(0.6 + prog * 4.0);
        p.material.opacity = 0.5 * (1.0 - prog);
        p.position.y += 1.5 * dt;
      }
    }
  }

  reset(pos, speed) {
    this.health = 100;
    this.crashed = false;
    this.isSmoking = false;
    this.physics.reset(pos, speed);
    this.mesh.visible = true;
  }
}
