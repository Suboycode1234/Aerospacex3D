import * as THREE from 'three';
import { Missile } from './Missile.js';

// Weapons, Ballistics, Flares, and FX Manager
export class WeaponManager {
  constructor(scene, soundSystem, modelLoader) {
    this.scene = scene;
    this.sound = soundSystem;
    this.modelLoader = modelLoader;

    // Cannon System (20mm Vulcan)
    this.gunAmmo = 750;
    this.gunMaxAmmo = 750;
    this.gunFireRate = 50; // rounds per sec
    this.gunMuzzleVel = 1080; // m/s
    this.gunCooldown = 0;
    this.bullets = [];
    this.bulletPoolSize = 120;
    this.setupBulletPool();

    // Guided Missile System (AIM-9X Sidewinder - Infinite Ammo)
    this.missileAmmo = Infinity;
    this.missileMaxAmmo = Infinity;
    this.missileCooldown = 0;
    this.missileFireInterval = 0.35; // Rapid tactical launch rate for infinite ordnance
    this.missiles = [];

    // Target Locking State
    this.currentTarget = null;
    this.lockState = 'none'; // 'none', 'tracking', 'locked'
    this.lockProgress = 0.0;
    this.lockRangeMax = 4800; // meters

    // Countermeasures (Flares)
    this.flareAmmo = 30;
    this.flareMaxAmmo = 30;
    this.flareCooldown = 0;
    this.flares = [];

    // Visual FX (Explosions & Sparks)
    this.explosions = [];
    this.sparks = [];

    // Gun fire alternate muzzles
    this.pylonSide = 1;
  }

  setupBulletPool() {
    this.bulletGroup = new THREE.Group();
    // High-glow tracer line geometry
    const tracerGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    tracerGeo.rotateX(Math.PI / 2); // Align with flight axis

    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffee55,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < this.bulletPoolSize; i++) {
      const b = new THREE.Mesh(tracerGeo, tracerMat.clone());
      b.visible = false;
      b.userData = {
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        origin: 'player',
        life: 0,
        maxLife: 2.2,
      };
      this.bullets.push(b);
      this.bulletGroup.add(b);
    }
    this.scene.add(this.bulletGroup);
  }

  // Fire 20mm Autocannon
  fireGun(pos, forward, planeVel, origin = 'player') {
    if (origin === 'player') {
      if (this.gunAmmo <= 0 || this.gunCooldown > 0) return false;
      this.gunAmmo--;
      this.gunCooldown = 1.0 / this.gunFireRate;
      this.sound.playCannonShot();
    }

    // Find available bullet in pool
    let bullet = this.bullets.find(b => !b.userData.active);
    if (!bullet) bullet = this.bullets[0]; // Recycle oldest

    const u = bullet.userData;
    u.active = true;
    u.origin = origin;
    u.life = 0;

    // Alternate left/right wing root gun port
    this.pylonSide = -this.pylonSide;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward));
    const muzzleOffset = forward.clone().multiplyScalar(4.0).addScaledVector(right, this.pylonSide * 0.85);

    u.pos.copy(pos).add(muzzleOffset);
    // Bullet velocity: aircraft velocity + muzzle velocity forward + small dispersion
    const dispersion = new THREE.Vector3(
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0
    );
    u.vel.copy(planeVel).addScaledVector(forward, this.gunMuzzleVel).add(dispersion);

    bullet.position.copy(u.pos);
    bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
    bullet.visible = true;

    return true;
  }

  // Launch Guided Missile
  fireMissile(pos, forward, planeVel, planeQuat, target, origin = 'player', allEnemies = []) {
    if (origin === 'player') {
      if (this.missileCooldown > 0) return false;
      // Infinite missile ammo - no decrement!
      this.missileCooldown = this.missileFireInterval;
      this.sound.playMissileLaunch();
    }

    // Auto-acquire target if none locked or dead:
    // A launched missile homes toward locked target or nearest/random live plane
    let missileTarget = target;
    if (!missileTarget || missileTarget.isDead) {
      if (allEnemies && allEnemies.length > 0) {
        let bestEnemy = null;
        let bestDot = 0.0;
        for (const en of allEnemies) {
          if (!en || en.isDead) continue;
          const toEn = en.position.clone().sub(pos).normalize();
          const dot = forward.dot(toEn);
          if (dot > bestDot) {
            bestDot = dot;
            bestEnemy = en;
          }
        }
        if (!bestEnemy) {
          const liveEnemies = allEnemies.filter(e => e && !e.isDead);
          if (liveEnemies.length > 0) {
            bestEnemy = liveEnemies[Math.floor(Math.random() * liveEnemies.length)];
          }
        }
        missileTarget = bestEnemy;
      }
    }

    // Get model instance from loader
    const mslModel = this.modelLoader.getMissileInstance();

    // Alternate wing pylon release
    this.pylonSide = -this.pylonSide;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(planeQuat);
    const pylonPos = pos.clone().addScaledVector(right, this.pylonSide * 3.4).add(new THREE.Vector3(0, -0.6, 0));

    // Initial missile velocity: fast ejection forward
    const launchVel = planeVel.clone().addScaledVector(forward, 100);

    const missile = new Missile({
      scene: this.scene,
      model: mslModel,
      origin: origin,
      target: missileTarget,
      position: pylonPos,
      velocity: launchVel,
      quaternion: planeQuat,
    });
    missile.enemiesList = allEnemies;

    missile.onExplode = (expPos, hitTarget, tgt) => {
      this.spawnExplosion(expPos, hitTarget ? 1.6 : 1.0);
      this.sound.playExplosion(this.scene.position ? expPos.distanceTo(this.scene.position) : 300);

      const targetToDamage = tgt || missileTarget;
      if (hitTarget && targetToDamage && targetToDamage.takeDamage) {
        targetToDamage.takeDamage(100, origin);
      }
    };

    this.missiles.push(missile);
    return true;
  }

  // Deploy Countermeasure Flares
  deployFlares(pos, planeVel, planeQuat) {
    if (this.flareAmmo <= 0 || this.flareCooldown > 0) return false;
    this.flareAmmo -= 2; // Eject in pairs
    this.flareCooldown = 0.35;
    this.sound.playFlareDeploy();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(planeQuat);

    // Eject left and right flares
    for (let side of [-1, 1]) {
      const flarePos = pos.clone().addScaledVector(right, side * 1.5).add(new THREE.Vector3(0, -0.5, 2.0));
      const flareVel = planeVel.clone()
        .multiplyScalar(0.4)
        .addScaledVector(right, side * (25 + Math.random() * 10))
        .add(new THREE.Vector3(0, -15 - Math.random() * 8, 0));

      const flareMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa33, blending: THREE.AdditiveBlending })
      );
      flareMesh.position.copy(flarePos);
      this.scene.add(flareMesh);

      this.flares.push({
        position: flarePos,
        velocity: flareVel,
        mesh: flareMesh,
        active: true,
        age: 0,
        lifetime: 3.5,
      });
    }

    return true;
  }

  // Update Radar / Missile Lock Acquisition
  updateTargetLock(playerPos, playerForward, target, allEnemies = []) {
    // If current target is invalid/dead, automatically acquire nearest enemy in front
    if (!target || target.isDead) {
      let bestTgt = null;
      let bestDot = 0.2; // Forward cone
      if (allEnemies) {
        for (const e of allEnemies) {
          if (!e || e.isDead) continue;
          const dir = e.position.clone().sub(playerPos).normalize();
          const dot = playerForward.dot(dir);
          if (dot > bestDot) {
            bestDot = dot;
            bestTgt = e;
          }
        }
      }
      target = bestTgt;
      this.currentTarget = target;
    }

    if (!target || target.isDead) {
      this.lockState = 'none';
      this.lockProgress = 0;
      this.sound.setLockTone('none');
      return;
    }

    const toTgt = target.position.clone().sub(playerPos);
    const dist = toTgt.length();

    if (dist > this.lockRangeMax) {
      this.lockState = 'none';
      this.lockProgress = 0;
      this.sound.setLockTone('none');
      return;
    }

    toTgt.normalize();
    const dot = playerForward.dot(toTgt); // Angle between nose and target

    // Fast, responsive lock-on in forward sector
    if (dot > 0.45) {
      this.lockProgress = 1.0;
      this.lockState = 'locked';
      this.sound.setLockTone('locked');
    } else if (dot > 0.1) {
      this.lockProgress = 0.7;
      this.lockState = 'tracking';
      this.sound.setLockTone('tracking');
    } else {
      this.lockState = 'none';
      this.lockProgress = 0;
      this.sound.setLockTone('none');
    }
  }

  // Spawn dynamic explosion effect
  spawnExplosion(pos, scale = 1.0) {
    const group = new THREE.Group();
    group.position.copy(pos);

    // Glowing core fireball
    const coreGeo = new THREE.SphereGeometry(4.0 * scale, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Shockwave ring
    const ringGeo = new THREE.RingGeometry(1.0, 3.0, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffeedd,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    this.explosions.push({
      group,
      core,
      ring,
      age: 0,
      lifetime: 1.2,
      scale: scale,
    });
  }

  update(dt, targets = [], player = null) {
    // Cooldowns
    if (this.gunCooldown > 0) this.gunCooldown -= dt;
    if (this.missileCooldown > 0) this.missileCooldown -= dt;
    if (this.flareCooldown > 0) this.flareCooldown -= dt;

    // 1. Update Bullets & Hit Detection
    const gravity = new THREE.Vector3(0, -9.81 * dt, 0);

    for (const b of this.bullets) {
      const u = b.userData;
      if (!u.active) continue;

      u.life += dt;
      if (u.life > u.maxLife || u.pos.y <= 0) {
        u.active = false;
        b.visible = false;
        continue;
      }

      // Ballistics integration
      u.vel.add(gravity);
      const nextPos = u.pos.clone().addScaledVector(u.vel, dt);

      // Hit check against enemies
      if (u.origin === 'player') {
        for (const tgt of targets) {
          if (!tgt || tgt.isDead) continue;
          const dist = nextPos.distanceTo(tgt.position);
          if (dist < 12.0) { // Hit registered!
            tgt.takeDamage(12, 'player');
            u.active = false;
            b.visible = false;
            this.spawnExplosion(nextPos, 0.35);
            break;
          }
        }
      } else if (u.origin === 'enemy' && player && !player.crashed) {
        // Enemy shooting at player
        const dist = nextPos.distanceTo(player.position);
        if (dist < 10.0) {
          player.takeDamage(8, 'enemy');
          u.active = false;
          b.visible = false;
          this.spawnExplosion(nextPos, 0.35);
        }
      }

      u.pos.copy(nextPos);
      b.position.copy(u.pos);
      // Align tracer with velocity
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), u.vel.clone().normalize());
    }

    // 2. Update Guided Missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const msl = this.missiles[i];
      msl.update(dt, this.flares);
      if (msl.isDead) {
        this.missiles.splice(i, 1);
      }
    }

    // 3. Update Flares
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.age += dt;
      if (f.age > f.lifetime || f.position.y <= 0) {
        f.active = false;
        this.scene.remove(f.mesh);
        this.flares.splice(i, 1);
        continue;
      }

      // Air resistance & gravity on flare
      f.velocity.multiplyScalar(0.96);
      f.velocity.y -= 9.8 * dt;
      f.position.addScaledVector(f.velocity, dt);
      f.mesh.position.copy(f.position);

      // Fade flare light
      const progress = f.age / f.lifetime;
      f.mesh.material.opacity = 1.0 - progress;
    }

    // 4. Update Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.age += dt;
      const progress = exp.age / exp.lifetime;

      if (progress >= 1.0) {
        this.scene.remove(exp.group);
        this.explosions.splice(i, 1);
        continue;
      }

      // Expand fireball
      const s = exp.scale * (1.0 + progress * 4.5);
      exp.core.scale.setScalar(s);
      exp.core.material.opacity = 0.9 * (1.0 - progress);

      // Expand shockwave
      const rs = exp.scale * (2.0 + progress * 15.0);
      exp.ring.scale.setScalar(rs);
      exp.ring.material.opacity = 0.8 * (1.0 - progress);
    }
  }

  // Predictive Lead Gunsight (LCOS / Lead Computing Optical Sight)
  calculateLeadReticle(playerPos, playerVel, targetPos, targetVel) {
    if (!targetPos) return null;

    const relPos = targetPos.clone().sub(playerPos);
    const dist = relPos.length();
    const relVel = targetVel.clone().sub(playerVel);

    // Time of flight approximation: t = dist / (V_muzzle + V_closure)
    const bulletSpeed = this.gunMuzzleVel;
    const timeOfFlight = dist / bulletSpeed;

    // Predicted future position of target accounting for bullet travel time and gravity
    const futurePos = targetPos.clone()
      .addScaledVector(relVel, timeOfFlight)
      .add(new THREE.Vector3(0, 0.5 * 9.81 * timeOfFlight * timeOfFlight, 0));

    return futurePos;
  }
}
