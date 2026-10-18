import * as THREE from 'three';

// 6-Degree-of-Freedom Aerodynamic Flight Dynamics Model
export class FlightModel {
  constructor(options = {}) {
    // Physical Characteristics (Typical Modern Air-Superiority Fighter)
    this.mass = options.mass || 14500; // kg
    this.wingArea = options.wingArea || 38.0; // m^2
    this.wingspan = options.wingspan || 11.5; // m
    this.aspectRatio = (this.wingspan * this.wingspan) / this.wingArea;
    this.oswaldEfficiency = 0.82;

    // Propulsion
    this.dryThrust = 95000; // Newtons
    this.afterburnerThrust = 260000; // Newtons (Powerful military afterburner)
    this.boostThrust = 440000; // Super-Boost thrust for extreme acceleration
    this.isBoosting = false;
    this.throttle = 0.45; // 0.0 to 1.0
    this.isAfterburner = false;
    this.airbrake = 0.0; // 0.0 to 1.0

    // Aerodynamic Constants
    this.cd0 = 0.020; // Zero-lift drag coefficient
    this.clAlpha = 4.8; // Lift curve slope per radian
    this.stallAoA = 18.0 * (Math.PI / 180); // 18 deg stall limit
    this.clMax = 1.65;

    // Control Authority Scaling - Balanced for precision military jet handling
    this.pitchRateMax = 1.35; // rad/s (~77 deg/s)
    this.rollRateMax = 2.2;  // rad/s (~126 deg/s)
    this.yawRateMax = 0.65;   // rad/s

    // Control Surface Inputs (-1.0 to 1.0)
    this.elevator = 0.0; // Pitch: positive pulls nose UP
    this.aileron = 0.0;  // Roll: positive banks RIGHT
    this.rudder = 0.0;   // Yaw: positive turns nose RIGHT

    // State Vectors (World Space)
    this.position = new THREE.Vector3(0, 1500, 0); // Start at 1500m alt
    this.velocity = new THREE.Vector3(0, 0, -220); // Initial 220 m/s (~430 knots) forward
    this.quaternion = new THREE.Quaternion();

    // Body Frame Vectors
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);

    // Angular Velocity in Body Coordinates (pitch, roll, yaw rates)
    this.angularVelocity = new THREE.Vector3(0, 0, 0);

    // Telemetry & Diagnostics
    this.airspeed = 220; // m/s
    this.knots = 427;
    this.mach = 0.65;
    this.altitude = 1500;
    this.aoa = 0.0; // Angle of Attack (deg)
    this.sideslip = 0.0; // Sideslip angle (deg)
    this.gForce = 1.0;
    this.maxG = 1.0;
    this.minG = 1.0;
    this.isStalled = false;
    this.groundElevation = 0; // Sea level default
    this.crashed = false;

    // Temporary Math Objects for Performance
    this._localVel = new THREE.Vector3();
    this._airVel = new THREE.Vector3();
    this._force = new THREE.Vector3();
    this._liftDir = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._rotDelta = new THREE.Quaternion();
  }

  // Atmospheric density at altitude h (meters)
  getAirDensity(h) {
    const hClamped = Math.max(0, h);
    // Standard barometric formula approximation
    return 1.225 * Math.exp(-hClamped / 8500);
  }

  // Speed of sound at altitude (m/s)
  getSpeedOfSound(h) {
    const tempKelvin = Math.max(216.65, 288.15 - 0.0065 * Math.max(0, h));
    return Math.sqrt(1.4 * 287.05 * tempKelvin);
  }

  update(dt) {
    if (this.crashed) return;
    dt = Math.max(0.001, Math.min(dt || 0.016, 0.033)); // Strict dt clamping (prevents physics explosion)

    // Sanity recovery if any NaN ever gets introduced
    if (isNaN(this.velocity.x) || !isFinite(this.velocity.x)) {
      this.velocity.set(0, 0, -220);
    }
    if (isNaN(this.position.x) || !isFinite(this.position.x)) {
      this.position.set(0, 1500, 0);
    }
    if (isNaN(this.quaternion.x) || !isFinite(this.quaternion.x)) {
      this.quaternion.identity();
    }

    // 1. Update orientation vectors
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion).normalize();

    // 2. Airspeed and Mach
    this.altitude = Math.max(0, this.position.y);
    const speed = this.velocity.length();
    this.airspeed = Math.max(1.0, speed); // Minimum 1 m/s to prevent division by zero
    this.knots = this.airspeed * 1.94384;
    const soundSpeed = this.getSpeedOfSound(this.altitude);
    this.mach = Math.max(0.01, this.airspeed / soundSpeed);

    // 3. Transform velocity to aircraft body frame
    // Local: X = right, Y = up, Z = backward (+Z is tail, -Z is nose)
    this._localVel.copy(this.velocity).applyQuaternion(this.quaternion.clone().invert());
    const vx = this._localVel.x;
    const vy = this._localVel.y;
    const vz = this._localVel.z; // In Three.js forward is -Z, so forward flight has vz < 0

    // Angle of Attack (alpha): angle between nose axis (-Z) and velocity in longitudinal plane
    this.aoa = Math.atan2(-vy, Math.max(0.001, -vz));
    this.aoaDeg = this.aoa * (180 / Math.PI);

    // Sideslip (beta)
    const slipRatio = Math.max(-1, Math.min(1, vx / this.airspeed));
    this.sideslip = Math.asin(slipRatio);
    this.sideslipDeg = this.sideslip * (180 / Math.PI);

    // 4. Dynamic Pressure: q = 0.5 * rho * v^2
    const rho = this.getAirDensity(this.altitude);
    const qDyn = 0.5 * rho * this.airspeed * this.airspeed;

    // 5. Aerodynamic Coefficients
    let cl = 0;
    const absAoA = Math.abs(this.aoa);
    if (absAoA < this.stallAoA) {
      cl = this.clAlpha * this.aoa;
      this.isStalled = false;
    } else {
      // Post-stall lift breakdown
      this.isStalled = true;
      const stallSign = Math.sign(this.aoa) || 1;
      const postStallFalloff = Math.cos(2 * (absAoA - this.stallAoA));
      cl = stallSign * this.clMax * Math.max(0.2, postStallFalloff);
    }
    cl = Math.max(-this.clMax, Math.min(this.clMax, cl));

    // Drag Coefficient: Cd = Cd0 + Induced + Transonic Wave Drag + Airbrake
    const cdInduced = (cl * cl) / (Math.PI * this.aspectRatio * this.oswaldEfficiency);
    let cdWave = 0;
    if (this.mach > 0.85) {
      // Smooth transonic drag peak that thins out at higher supersonic Mach numbers
      cdWave = 0.020 * Math.exp(-Math.pow((this.mach - 1.05) / 0.25, 2)) + (this.mach > 1.2 ? 0.005 : 0);
    }
    const cdAirbrake = this.airbrake * 0.35; // Substantial aerodynamic braking drag
    const cd = this.cd0 + cdInduced + cdWave + cdAirbrake;

    // 6. Compute Aerodynamic Forces
    const liftMag = qDyn * this.wingArea * cl;
    const dragMag = qDyn * this.wingArea * cd;

    const velNorm = this.velocity.clone();
    if (velNorm.lengthSq() > 0.01) {
      velNorm.normalize();
    } else {
      velNorm.copy(this.forward);
    }

    this._liftDir.crossVectors(this.right, velNorm);
    if (this._liftDir.lengthSq() > 0.01) {
      this._liftDir.normalize();
    } else {
      this._liftDir.copy(this.up);
    }

    const liftForce = this._liftDir.clone().multiplyScalar(liftMag);
    const dragForce = velNorm.clone().multiplyScalar(-dragMag);

    // 7. Engine Thrust
    this.isAfterburner = this.throttle > 0.88 || this.isBoosting;
    let currentThrust = 0;
    if (this.isBoosting) {
      // Super-Boost active: blazing rocket acceleration
      currentThrust = this.boostThrust;
    } else if (this.throttle > 0.88) {
      // Afterburner engaged: scale from dry to max AB
      const abFactor = (this.throttle - 0.88) / 0.12;
      currentThrust = this.dryThrust + abFactor * (this.afterburnerThrust - this.dryThrust);
    } else {
      currentThrust = (this.throttle / 0.88) * this.dryThrust;
    }
    // Air density thrust reduction at extreme altitudes
    currentThrust *= Math.sqrt(rho / 1.225);
    const thrustForce = this.forward.clone().multiplyScalar(currentThrust);

    // 8. Gravity Force
    const gravityForce = new THREE.Vector3(0, -this.mass * 9.80665, 0);

    // Total translational force
    this._force.set(0, 0, 0)
      .add(thrustForce)
      .add(liftForce)
      .add(dragForce)
      .add(gravityForce);

    // Acceleration: a = F / m
    this._accel.copy(this._force).divideScalar(this.mass);

    // Integrate Velocity
    this.velocity.addScaledVector(this._accel, dt);

    // Coordinated Aerodynamic Velocity Carving
    // Fighter aircraft aerodynamics force the velocity vector to tightly follow
    // the fuselage heading. Eliminates lateral slide/skid completely during turns.
    const currentSpeed = Math.max(5.0, this.velocity.length());
    const carvingRate = this.isStalled ? Math.min(1.0, 4.0 * dt) : Math.min(1.0, 16.0 * dt);
    
    // Rotate velocity direction vector towards aircraft forward axis
    const velDirection = this.velocity.clone().normalize();
    velDirection.lerp(this.forward, carvingRate).normalize();
    this.velocity.copy(velDirection).multiplyScalar(currentSpeed);

    // Active Airbrake aerodynamic braking
    if (this.airbrake > 0) {
      const brakeDecel = this.airbrake * 20.0 * dt;
      if (this.airspeed > 35) {
        this.velocity.multiplyScalar(Math.max(0.35, 1.0 - (brakeDecel / this.airspeed)));
      }
    }

    this.position.addScaledVector(this.velocity, dt);

    // 9. Angular Control & Moments with Fly-By-Wire (FBW) Stabilization
    // Dynamic pressure control effectiveness factor
    const ctrlEfficacy = Math.min(1.2, Math.max(0.3, qDyn / 12000)) * (this.isStalled ? 0.45 : 1.0);

    // Rudder Level-Turn FBW Compensation:
    // Prevents aircraft from dipping downwards during A/D yaw turns
    const rudderMag = Math.abs(this.rudder);
    let rudderPitchTrim = 0;
    if (rudderMag > 0.05 && this.elevator >= -0.05) {
      // Automatic elevator back-pressure to counteract turn induced drag and hold altitude
      rudderPitchTrim = rudderMag * 0.35 * ctrlEfficacy;
      // Extra compensation if vertical speed drops
      if (this.velocity.y < 0) {
        rudderPitchTrim += Math.min(0.6, -this.velocity.y * 0.06);
        // Direct vertical velocity dampening so plane does not sink during rudder turns
        this.velocity.y += Math.min(15.0, -this.velocity.y * 6.0 * dt);
      }
    }

    const targetPitchRate = (this.elevator * this.pitchRateMax * ctrlEfficacy) + rudderPitchTrim;
    // Pure aileron roll (wings stay level during pure rudder A/D steering)
    const targetRollRate = this.aileron * this.rollRateMax * ctrlEfficacy;
    // Responsive yaw rate
    const weatherVane = -this.sideslip * 0.8 * ctrlEfficacy;
    const targetYawRate = (this.rudder * this.yawRateMax * ctrlEfficacy) + weatherVane;

    // Fly-By-Wire (FBW) Active Rate Damping
    const isPitchActive = Math.abs(this.elevator) > 0.05 || rudderMag > 0.05;
    const isRollActive = Math.abs(this.aileron) > 0.05;
    const isYawActive = rudderMag > 0.05;

    const pitchDamping = isPitchActive ? 16.0 : 26.0;
    const rollDamping = isRollActive ? 18.0 : 32.0;
    const yawDamping = isYawActive ? 14.0 : 24.0;

    this.angularVelocity.x += (targetPitchRate - this.angularVelocity.x) * pitchDamping * dt;
    this.angularVelocity.y += (targetYawRate - this.angularVelocity.y) * yawDamping * dt;
    this.angularVelocity.z += (targetRollRate - this.angularVelocity.z) * rollDamping * dt;

    // Active Rate-Kill: Instantly zero residual rotational drift when controls are released
    if (!isPitchActive) {
      this.angularVelocity.x *= Math.max(0, 1.0 - 20.0 * dt);
    }
    if (!isRollActive) {
      this.angularVelocity.z *= Math.max(0, 1.0 - 25.0 * dt);
    }
    if (!isYawActive) {
      this.angularVelocity.y *= Math.max(0, 1.0 - 18.0 * dt);
    }

    // Apply stall buffeting / shudder
    if (this.isStalled) {
      this.angularVelocity.x += (Math.random() - 0.5) * 0.4;
      this.angularVelocity.z += (Math.random() - 0.5) * 0.8;
    }

    // Integrate Rotation: Body rates to Quaternion
    const rotEuler = new THREE.Euler(
      this.angularVelocity.x * dt,
      this.angularVelocity.y * dt,
      this.angularVelocity.z * dt,
      'YXZ'
    );
    this._rotDelta.setFromEuler(rotEuler);
    this.quaternion.multiply(this._rotDelta);
    this.quaternion.normalize();

    // 10. G-Force Calculation
    const apparentAccel = this._accel.clone().sub(new THREE.Vector3(0, -9.80665, 0));
    const normalAccel = apparentAccel.dot(this.up);
    this.gForce = normalAccel / 9.80665;

    if (this.gForce > this.maxG) this.maxG = this.gForce;
    if (this.gForce < this.minG) this.minG = this.gForce;

    // 11. Zone Boundary Containment (Dynamic center based on active airspace)
    const bCenter = this.boundaryCenter || new THREE.Vector3(0, 0, 0);
    const bRadius = this.boundaryRadius || 5500.0;
    const dx = this.position.x - bCenter.x;
    const dz = this.position.z - bCenter.z;
    const distFromCenter = Math.hypot(dx, dz);

    if (distFromCenter >= bRadius) {
      // Clamp position strictly inside boundary rim
      const angle = Math.atan2(dz, dx);
      this.position.x = bCenter.x + Math.cos(angle) * (bRadius - 2.0);
      this.position.z = bCenter.z + Math.sin(angle) * (bRadius - 2.0);

      // Kill any velocity pointing outside the boundary
      const normalOut = new THREE.Vector3(dx, 0, dz).normalize();
      const dotOut = this.velocity.dot(normalOut);
      if (dotOut > 0) {
        this.velocity.sub(normalOut.clone().multiplyScalar(dotOut * 1.5));
      }

      // Turnaround vector pointing back to zone center
      const toCenter = new THREE.Vector3(-dx, 0, -dz).normalize();
      this.velocity.lerp(toCenter.clone().multiplyScalar(this.airspeed), Math.min(1.0, 8.0 * dt));

      // Slerp aircraft heading back into sector
      const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), toCenter);
      this.quaternion.slerp(targetQuat, Math.min(1.0, 6.0 * dt));
    }

    // Flight Ceiling (4000m) - cannot exit into space
    if (this.position.y > 4000.0) {
      this.position.y = 3995.0;
      if (this.velocity.y > 0) this.velocity.y = -20.0;
    }

    // 12. Dynamic Ground Elevation & Runway Roll / Takeoff Check
    const distFromIsland1 = Math.hypot(this.position.x, this.position.z);
    const distFromIsland2 = Math.hypot(this.position.x, this.position.z - (-8200));
    const onIsland = (distFromIsland1 < 3200 && this.position.z > -4200) || (distFromIsland2 < 3200 && this.position.z < -4500);
    this.groundElevation = onIsland ? 37.8 : 0.0;
    const gearHeight = 1.7;

    if (this.position.y <= this.groundElevation + gearHeight) {
      this.position.y = this.groundElevation + gearHeight;

      // Check for hard crash: violent vertical impact, inverted bank, or steep pitch down
      const hardImpact = this.velocity.y < -12.0;
      const wingsLevel = Math.abs(this.up.y) > 0.70; // Safe pitch/roll angle for landing gear
      const steepNoseDive = this.forward.y < -0.35;

      if (hardImpact || !wingsLevel || steepNoseDive) {
        this.crashed = true;
      } else {
        // Smooth rolling on ground / runway
        if (this.velocity.y < 0) this.velocity.y = 0;

        // Low rolling resistance on runway allows smooth acceleration and takeoff
        const isRunway1 = distFromIsland1 < 2400 && Math.abs(this.position.x) < 120 && this.position.z > -4200;
        const isRunway2 = distFromIsland2 < 2400 && Math.abs(this.position.x) < 120 && this.position.z < -4500;
        const isRunway = isRunway1 || isRunway2;
        let friction = isRunway ? 0.998 : 0.96;
        if (this.airbrake > 0) {
          friction = 0.86; // Active wheel braking on ground
        }
        this.velocity.x *= friction;
        this.velocity.z *= friction;

        // Keep wings level on ground roll
        this.angularVelocity.z *= 0.85;
      }
    }
  }

  reset(pos = new THREE.Vector3(0, 1500, 0), speed = 240) {
    this.position.copy(pos);
    this.velocity.set(0, 0, -speed);
    this.quaternion.identity();
    this.angularVelocity.set(0, 0, 0);
    this.throttle = 0.6;
    this.elevator = 0;
    this.aileron = 0;
    this.rudder = 0;
    this.airbrake = 0;
    this.crashed = false;
    this.maxG = 1.0;
    this.minG = 1.0;
  }
}
