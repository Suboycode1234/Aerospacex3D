import * as THREE from 'three';

// Air-to-Air Guided Missile with Proportional Navigation (Pro-Nav)
export class Missile {
  constructor(options = {}) {
    this.scene = options.scene;
    this.model = options.model;
    this.origin = options.origin; // 'player' or 'enemy'
    this.target = options.target; // Aircraft target reference

    this.position = new THREE.Vector3().copy(options.position);
    this.velocity = new THREE.Vector3().copy(options.velocity);
    this.quaternion = new THREE.Quaternion().copy(options.quaternion);

    // Physical & Propulsion specs
    this.mass = 85.0; // kg
    this.motorThrust = 16500.0; // Newtons
    this.burnDuration = 3.8; // Seconds of rocket motor burn
    this.maxSpeed = 920.0; // m/s (~Mach 2.7)
    this.maxG = 35.0; // Max lateral turn acceleration G limit
    this.navConstant = 3.8; // Proportional navigation constant N

    // Flight state
    this.age = 0.0;
    this.lifetime = 12.0; // Max time to live
    this.isDead = false;
    this.isMotorBurning = true;
    this.proximityFuzeDist = 10.0; // Meters
    this.lastDistToTarget = 999999;

    // Seeker lock
    this.seekerConeCos = Math.cos(35 * (Math.PI / 180)); // 35 deg seeker FOV
    this.decoyedByFlare = false;
    this.decoyTargetPos = null;

    // Attach mesh to scene
    this.mesh = this.model;
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);
    this.scene.add(this.mesh);

    // Smoke trail particles container
    this.smokePool = [];
    this.smokeCount = 45;
    this.smokeIndex = 0;
    this.setupSmokeTrail();

    // Direction vector cache
    this.forward = new THREE.Vector3(0, 0, -1);
  }

  setupSmokeTrail() {
    this.smokeGroup = new THREE.Group();
    const smokeGeo = new THREE.SphereGeometry(0.35, 6, 6);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    for (let i = 0; i < this.smokeCount; i++) {
      const p = new THREE.Mesh(smokeGeo, smokeMat.clone());
      p.visible = false;
      p.userData = { life: 0, maxLife: 1.8, scale: 0.35 };
      this.smokePool.push(p);
      this.smokeGroup.add(p);
    }
    this.scene.add(this.smokeGroup);
  }

  spawnSmokePuff(pos) {
    const p = this.smokePool[this.smokeIndex];
    this.smokeIndex = (this.smokeIndex + 1) % this.smokeCount;

    p.position.copy(pos);
    p.visible = true;
    p.userData.life = p.userData.maxLife;
    p.scale.setScalar(0.4);
    p.material.opacity = 0.65;
  }

  updateSmokeTrail(dt) {
    for (let i = 0; i < this.smokeCount; i++) {
      const p = this.smokePool[i];
      if (!p.visible) continue;

      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        p.visible = false;
      } else {
        const progress = 1.0 - (p.userData.life / p.userData.maxLife);
        p.scale.setScalar(0.4 + progress * 3.2); // Expands as it cools
        p.material.opacity = 0.65 * (1.0 - progress); // Fades
        p.position.y += 0.8 * dt; // Slight thermal buoyancy
      }
    }
  }

  update(dt, flares = []) {
    if (this.isDead) return;
    this.age += dt;

    if (this.age > this.lifetime) {
      this.explode(false);
      return;
    }

    // 1. Forward direction
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();

    // 2. Propulsion
    this.isMotorBurning = this.age < this.burnDuration;
    if (this.isMotorBurning) {
      const thrustAccel = (this.motorThrust / this.mass) * dt;
      this.velocity.addScaledVector(this.forward, thrustAccel);
      // Spawn rocket exhaust smoke
      const exhaustPos = this.position.clone().addScaledVector(this.forward, 1.4);
      this.spawnSmokePuff(exhaustPos);
    } else {
      // Coasting with aerodynamic drag
      const speed = this.velocity.length();
      const dragAccel = (0.5 * 1.2 * speed * speed * 0.04) / this.mass;
      this.velocity.addScaledVector(this.forward, -dragAccel * dt);
    }

    // Cap maximum missile speed
    const currentSpeed = this.velocity.length();
    if (currentSpeed > this.maxSpeed) {
      this.velocity.setLength(this.maxSpeed);
    }

    // 3. Countermeasure (Flare) Detection
    if (!this.decoyedByFlare && flares.length > 0) {
      for (const flare of flares) {
        if (!flare.active) continue;
        const toFlare = flare.position.clone().sub(this.position);
        const distFlare = toFlare.length();
        if (distFlare < 1200) {
          toFlare.normalize();
          const dot = this.forward.dot(toFlare);
          if (dot > this.seekerConeCos) {
            // Seeker seduced by flare heat signature (80% chance if close)
            if (Math.random() < 0.75) {
              this.decoyedByFlare = true;
              this.decoyTargetPos = flare.position;
              break;
            }
          }
        }
      }
    }

    // 4. Relentless Guidance & Target Homing
    let targetPos = null;
    let targetVel = new THREE.Vector3(0, 0, 0);

    if (this.decoyedByFlare && this.decoyTargetPos) {
      targetPos = this.decoyTargetPos;
    } else {
      // Re-acquire live target if current is dead or null
      if (!this.target || this.target.isDead) {
        if (this.enemiesList && this.enemiesList.length > 0) {
          let closest = null;
          let minDist = 999999;
          for (const en of this.enemiesList) {
            if (!en || en.isDead) continue;
            const d = this.position.distanceTo(en.position);
            if (d < minDist) {
              minDist = d;
              closest = en;
            }
          }
          this.target = closest;
        }
      }

      if (this.target && !this.target.isDead) {
        targetPos = this.target.position;
        if (this.target.velocity) targetVel = this.target.velocity;
      }
    }

    if (targetPos) {
      const relPos = targetPos.clone().sub(this.position);
      const dist = relPos.length();

      // Lead pursuit: aim toward predicted target position based on flight time
      const timeToImpact = Math.min(2.5, dist / Math.max(100.0, currentSpeed));
      const leadTarget = targetPos.clone().addScaledVector(targetVel, timeToImpact * 0.7);
      const desiredDir = leadTarget.sub(this.position).normalize();

      // Aggressive steering toward lead target
      const steerStrength = Math.min(1.0, 16.0 * dt);
      const currentDir = this.velocity.clone().normalize();
      currentDir.lerp(desiredDir, steerStrength).normalize();
      this.velocity.copy(currentDir).multiplyScalar(Math.max(currentSpeed, 450.0));

      // Align missile attitude with velocity
      this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), currentDir);
    }

    // 5. Integrate Position with Continuous Raycast Segment Hit Detection
    const prevPos = this.position.clone();
    this.position.addScaledVector(this.velocity, dt);
    const newPos = this.position.clone();

    // Raycast Segment Collision Check:
    // Guarantees high-speed missiles never tunnel through enemy aircraft
    const segment = newPos.clone().sub(prevPos);
    const segLength = segment.length();
    const segDir = segment.clone().normalize();

    let directHit = false;
    let hitObject = this.target;

    // Check collision against locked target
    if (this.target && !this.target.isDead) {
      const v = this.target.position.clone().sub(prevPos);
      const proj = Math.max(0, Math.min(segLength, v.dot(segDir)));
      const closestPoint = prevPos.clone().addScaledVector(segDir, proj);
      const d = closestPoint.distanceTo(this.target.position);

      if (d < 30.0 || this.position.distanceTo(this.target.position) < 32.0) {
        directHit = true;
        hitObject = this.target;
      }
    }

    // Also check collision against any other aircraft in flight
    if (!directHit && this.enemiesList) {
      for (const en of this.enemiesList) {
        if (!en || en.isDead) continue;
        const v = en.position.clone().sub(prevPos);
        const proj = Math.max(0, Math.min(segLength, v.dot(segDir)));
        const closestPoint = prevPos.clone().addScaledVector(segDir, proj);
        const d = closestPoint.distanceTo(en.position);

        if (d < 30.0 || this.position.distanceTo(en.position) < 32.0) {
          directHit = true;
          hitObject = en;
          break;
        }
      }
    }

    if (directHit) {
      this.explode(true, hitObject);
      return;
    }

    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);

    // Update smoke trail particles
    this.updateSmokeTrail(dt);

    // Ground impact check
    if (this.position.y <= 0) {
      this.explode(false);
    }
  }

  explode(hitTarget = false, hitObject = null) {
    if (this.isDead) return;
    this.isDead = true;

    // Hide mesh
    if (this.mesh) this.mesh.visible = false;

    // Clean up smoke group and mesh after delay
    setTimeout(() => {
      if (this.smokeGroup && this.scene) {
        this.scene.remove(this.smokeGroup);
      }
      if (this.mesh && this.scene) {
        this.scene.remove(this.mesh);
      }
    }, 2500);

    if (this.onExplode) {
      this.onExplode(this.position.clone(), hitTarget, hitObject || this.target);
    }
  }
}
