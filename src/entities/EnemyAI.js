import * as THREE from 'three';
import { FlightModel } from '../physics/FlightModel.js';

// Enemy Fighter Jet with Dogfight Combat AI
export class EnemyAI {
  constructor(options = {}) {
    this.id = options.id || Math.floor(Math.random() * 1000);
    this.scene = options.scene;
    this.modelLoader = options.modelLoader;
    this.callsign = options.callsign || `BANDIT-${this.id % 90 + 10}`;

    // Flight Physics Instance
    this.physics = new FlightModel({
      mass: 14000,
      wingArea: 36.0,
      wingspan: 11.0,
    });
    this.physics.position.copy(options.position || new THREE.Vector3(2000, 2200, -3500));
    this.physics.velocity.set((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80).normalize().multiplyScalar(220);

    // Combat Stats
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;
    this.deathTimer = 0;

    // AI Tactical State Machine
    this.state = 'PATROL'; // 'PATROL', 'PURSUIT', 'GUNS_ATTACK', 'EVADE'
    this.stateTimer = 0;
    this.target = options.target || null;

    // AI Weapon Cooldowns
    this.gunBurstTimer = 0;
    this.gunBurstCooldown = 0;
    this.missileCooldown = 6.0 + Math.random() * 4.0;
    this.flareCooldown = 0;
    this.missileAmmo = 4;

    // Smoke trail on heavy damage
    this.isSmoking = false;

    // Setup 3D Mesh
    this.mesh = this.modelLoader.getJetInstance();
    this.mesh.position.copy(this.physics.position);
    this.mesh.quaternion.copy(this.physics.quaternion);

    // Tint enemy jet airframe with aggressor camouflage accents for clear identification
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material && !Array.isArray(child.material)) {
        const matName = (child.material.name || '').toLowerCase();
        if (!matName.includes('glass') && !child.material.transparent) {
          child.material = child.material.clone();
          if (child.material.color) {
            child.material.color.multiplyScalar(0.7).add(new THREE.Color(0x221111));
          }
        }
      }
    });
    this.scene.add(this.mesh);
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

  takeDamage(amount, origin = 'player') {
    if (this.isDead) return;
    this.health -= amount;

    if (this.health <= 40) {
      this.isSmoking = true;
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      if (this.onKilled) this.onKilled(this, origin);
    } else {
      // Retaliate or evade
      if (Math.random() < 0.6) {
        this.state = 'EVADE';
        this.stateTimer = 2.5;
      }
    }
  }

  update(dt, player, weaponManager) {
    if (this.isDead) {
      // Spinning crash descent
      this.deathTimer += dt;
      this.physics.velocity.y -= 18 * dt;
      this.physics.position.addScaledVector(this.physics.velocity, dt);
      this.mesh.position.copy(this.physics.position);
      this.mesh.rotation.x += 1.5 * dt;
      this.mesh.rotation.z += 2.8 * dt;

      if (this.physics.position.y <= 0 || this.deathTimer > 6.0) {
        this.mesh.visible = false;
        this.scene.remove(this.mesh);
      }
      return;
    }

    this.stateTimer -= dt;
    this.missileCooldown -= dt;
    this.flareCooldown -= dt;

    // Update target
    this.target = player;
    const playerPos = player.position;
    const distToPlayer = this.position.distanceTo(playerPos);

    // AI Decision Logic
    const toPlayer = playerPos.clone().sub(this.position).normalize();
    const noseDot = this.forward.dot(toPlayer); // 1.0 = player directly in front
    const playerBehindMe = this.forward.dot(toPlayer) < -0.4;

    // State Transitions
    if (this.peaceful) {
      this.state = 'PATROL';
    } else if (this.state === 'EVADE') {
      if (this.stateTimer <= 0) {
        this.state = 'PURSUIT';
      }
    } else if (distToPlayer < 900 && noseDot > 0.94) {
      this.state = 'GUNS_ATTACK';
    } else if (distToPlayer < 5000) {
      this.state = 'PURSUIT';
    } else {
      this.state = 'PATROL';
    }

    // AI Flight Inputs
    let targetElevator = 0;
    let targetAileron = 0;
    let targetRudder = 0;
    let targetThrottle = 0.75;

    if (this.state === 'EVADE') {
      // High-G break turn + deploy flares
      targetElevator = 1.0; // Hard pitch up
      targetAileron = 0.9;  // Hard bank
      targetThrottle = 1.0; // Max afterburner to keep energy

      if (this.flareCooldown <= 0 && Math.random() < 0.4) {
        weaponManager.deployFlares(this.position, this.velocity, this.physics.quaternion);
        this.flareCooldown = 1.5;
      }
    } else if (this.state === 'PURSUIT' || this.state === 'GUNS_ATTACK') {
      // Compute lead intercept point
      const leadPos = weaponManager.calculateLeadReticle(this.position, this.velocity, playerPos, player.velocity);
      const steerTarget = leadPos || playerPos;

      // Transform target point to local coordinates
      const invQuat = this.physics.quaternion.clone().invert();
      const localTarget = steerTarget.clone().sub(this.position).applyQuaternion(invQuat);

      // Local coordinate errors:
      // X: lateral offset (- is left, + is right)
      // Y: vertical offset (- is down, + is up)
      // Z: longitudinal (- is forward)

      // Pitch control: aim nose toward target Y
      const pitchError = Math.atan2(localTarget.y, -localTarget.z);
      targetElevator = Math.max(-1.0, Math.min(1.0, pitchError * 3.0));

      // Roll control: bank to point wings toward target
      const rollAngle = Math.atan2(localTarget.x, localTarget.y);
      targetAileron = Math.max(-1.0, Math.min(1.0, rollAngle * 1.8));

      // Yaw fine-tuning
      const yawError = Math.atan2(localTarget.x, -localTarget.z);
      targetRudder = Math.max(-0.6, Math.min(0.6, yawError * 1.5));

      // Energy management throttle
      if (distToPlayer > 1800) {
        targetThrottle = 1.0; // Chase with afterburner
      } else if (distToPlayer < 500 && noseDot > 0.8) {
        targetThrottle = 0.35; // Airbrake to prevent overshooting
      } else {
        targetThrottle = 0.8;
      }

      // Close-in 20mm Autocannon Combat
      if (this.state === 'GUNS_ATTACK' && noseDot > 0.94) {
        // High-cadence burst fire when guns lead reticle aligns
        this.gunBurstTimer += dt;
        if (this.gunBurstTimer < 0.75) {
          weaponManager.fireGun(this.position, this.forward, this.velocity, 'enemy');
        } else if (this.gunBurstTimer > 1.3) {
          this.gunBurstTimer = 0;
        }
      }
    } else {
      // PATROL: Level cruise
      if (this.position.y < 1200) targetElevator = 0.4;
      else if (this.position.y > 3000) targetElevator = -0.3;
      targetThrottle = 0.6;
    }

    // Low Altitude Ground Avoidance Override (PULL UP!)
    if (this.position.y < 350) {
      targetElevator = 1.0;
      targetThrottle = 1.0;
      targetAileron *= 0.2; // Level wings
    }

    // Island Perimeter Boundary Containment (Turn back towards center if reaching 3200m)
    const distFromIslandCenter = Math.hypot(this.position.x, this.position.z);
    if (distFromIslandCenter > 3200) {
      const angleToCenter = Math.atan2(-this.position.x, -this.position.z);
      const euler = new THREE.Euler().setFromQuaternion(this.physics.quaternion, 'YXZ');
      let headingDiff = angleToCenter - (-euler.y);
      while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
      while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
      targetAileron = Math.max(-1.0, Math.min(1.0, headingDiff * 2.5));
      targetElevator = 0.8; // Hard turn with pitch
      targetThrottle = 0.9;
    }

    // Apply inputs to flight model
    this.physics.elevator = targetElevator;
    this.physics.aileron = targetAileron;
    this.physics.rudder = targetRudder;
    this.physics.throttle = targetThrottle;

    // Step physics
    this.physics.update(dt);

    // Sync 3D mesh
    this.mesh.position.copy(this.physics.position);
    this.mesh.quaternion.copy(this.physics.quaternion);

    // Animate Afterburner Flame
    const flameL = this.mesh.getObjectByName('FlameLeft');
    const flameR = this.mesh.getObjectByName('FlameRight');
    const isAB = this.physics.isAfterburner;
    if (flameL && flameR) {
      flameL.visible = isAB;
      flameR.visible = isAB;
      if (isAB) {
        const pulse = 0.85 + Math.random() * 0.3;
        flameL.scale.set(1, 1, pulse);
        flameR.scale.set(1, 1, pulse);
      }
    }
  }
}
