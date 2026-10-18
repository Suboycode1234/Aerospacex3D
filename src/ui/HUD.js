import * as THREE from 'three';

// Military Fighter Jet Head-Up Display (HUD) and Tactical Radar
export class HUD {
  constructor(canvas, radarCanvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.radarCanvas = radarCanvas;
    this.radarCtx = radarCanvas.getContext('2d');
    this.camera = camera;

    this.hudColor = '#00ffaa';
    this.hudAlertColor = '#ff2244';
    this.hudWarnColor = '#ffcc00';

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Reusable Vector Math
    this._vScreen = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.cx = this.width / 2;
    this.cy = this.height / 2;
  }

  // Project 3D World Position to 2D HUD Screen Coordinates
  worldToScreen(worldPos) {
    this._vScreen.copy(worldPos);
    this._vScreen.project(this.camera);

    // Behind camera check
    if (this._vScreen.z > 1.0) {
      return { x: 0, y: 0, visible: false };
    }

    const x = (this._vScreen.x * 0.5 + 0.5) * this.width;
    const y = (-this._vScreen.y * 0.5 + 0.5) * this.height;

    return { x, y, visible: true };
  }

  render(player, enemies = [], weaponManager = null, incomingMissile = false, activePortal = null, currentAirspace = 'HOME_BASE') {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!player) return;
    const phys = player.physics;

    // HUD Center Coordinates
    const cx = this.cx;
    const cy = this.cy;

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.hudColor;
    ctx.fillStyle = this.hudColor;
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.shadowColor = 'rgba(0, 255, 170, 0.4)';
    ctx.shadowBlur = 4;

    // 1. Waterline / Aircraft Boresight Cross
    this.drawBoresight(ctx, cx, cy);

    // 2. Flight Path Marker (Velocity Vector)
    this.drawFlightPathMarker(ctx, cx, cy, phys);

    // 3. Pitch Ladder & Artificial Horizon
    this.drawPitchLadder(ctx, cx, cy, phys);

    // 4. Airspeed & Altitude Tapes
    this.drawFlightDataTapes(ctx, cx, cy, phys);

    // 5. Heading Compass Tape
    this.drawHeadingTape(ctx, cx, phys);

    // 6. Target Locking & Gunsight LCOS
    if (weaponManager && weaponManager.currentTarget) {
      this.drawTargetHUD(ctx, player, weaponManager.currentTarget, weaponManager);
    }

    // 7. Tactical Threat Warning (Bandit on Six)
    if (incomingMissile) {
      this.drawThreatWarning(ctx, cx, cy);
    }

    // 7.5 Combat Perimeter Boundary Proximity Alert (Only in combat zone)
    if (currentAirspace === 'HOSTILE_AIRSPACE') {
      const bCenter = phys.boundaryCenter || new THREE.Vector3(0, 0, -8200);
      const distFromCenter = Math.hypot(phys.position.x - bCenter.x, phys.position.z - bCenter.z);
      if (distFromCenter > 3800) {
        this.drawPerimeterWarning(ctx, cx, cy, distFromCenter);
      }
    }

    // 7.7 Quantum Warp Portal Waypoint & Takeoff Navigation
    if (activePortal) {
      this.drawPortalHUD(ctx, player, activePortal, currentAirspace);
    }

    ctx.restore();

    // 8. Render Tactical Radar Screen
    this.renderRadar(player, enemies, weaponManager ? weaponManager.missiles : [], activePortal);
  }

  drawBoresight(ctx, cx, cy) {
    // Aircraft reference cross symbol
    ctx.beginPath();
    // Center dot
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Small gull wings
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx - 5, cy + 4);

    ctx.moveTo(cx + 20, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx + 5, cy + 4);
    ctx.stroke();
  }

  drawFlightPathMarker(ctx, cx, cy, phys) {
    // Shows where the plane is actually traveling (AoA & Sideslip offset)
    const pxPerDeg = 14;
    const fpmX = cx + phys.sideslipDeg * pxPerDeg;
    const fpmY = cy + phys.aoaDeg * pxPerDeg;

    ctx.save();
    ctx.beginPath();
    ctx.arc(fpmX, fpmY, 7, 0, Math.PI * 2);
    // Wings
    ctx.moveTo(fpmX - 7, fpmY);
    ctx.lineTo(fpmX - 16, fpmY);
    ctx.moveTo(fpmX + 7, fpmY);
    ctx.lineTo(fpmX + 16, fpmY);
    // Fin
    ctx.moveTo(fpmX, fpmY - 7);
    ctx.lineTo(fpmX, fpmY - 14);
    ctx.stroke();
    ctx.restore();
  }

  drawPitchLadder(ctx, cx, cy, phys) {
    // Extract Euler angles for horizon drawing
    const euler = new THREE.Euler().setFromQuaternion(phys.quaternion, 'YXZ');
    const pitch = euler.x; // radians
    const roll = -euler.z;  // bank angle
    const pitchDeg = pitch * (180 / Math.PI);

    const pxPerDeg = 14;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(roll);

    // Horizon Line
    const horizonY = pitchDeg * pxPerDeg;
    ctx.beginPath();
    ctx.moveTo(-160, horizonY);
    ctx.lineTo(160, horizonY);
    ctx.stroke();

    // Pitch Rungs (-90 to +90 deg in steps of 10 deg)
    for (let p = -80; p <= 80; p += 10) {
      if (p === 0) continue;
      const rungY = (pitchDeg - p) * pxPerDeg;

      // Only draw rungs within visible HUD window
      if (Math.abs(rungY) > 280) continue;

      ctx.beginPath();
      const isClimb = p > 0;
      const halfW = 45;

      if (isClimb) {
        // Solid ladder rungs
        ctx.setLineDash([]);
        ctx.moveTo(-halfW, rungY);
        ctx.lineTo(-15, rungY);
        ctx.lineTo(-15, rungY + 6);

        ctx.moveTo(halfW, rungY);
        ctx.lineTo(15, rungY);
        ctx.lineTo(15, rungY + 6);
      } else {
        // Dashed dive ladder rungs with downward slope
        ctx.setLineDash([4, 4]);
        ctx.moveTo(-halfW, rungY);
        ctx.lineTo(-15, rungY);
        ctx.lineTo(-15, rungY - 6);

        ctx.moveTo(halfW, rungY);
        ctx.lineTo(15, rungY);
        ctx.lineTo(15, rungY - 6);
      }
      ctx.stroke();

      // Pitch angle numbers
      ctx.setLineDash([]);
      ctx.fillText(`${Math.abs(p)}`, -halfW - 22, rungY + 4);
      ctx.fillText(`${Math.abs(p)}`, halfW + 6, rungY + 4);
    }

    ctx.restore();
  }

  drawFlightDataTapes(ctx, cx, cy, phys) {
    // 1. Airspeed Tape (Left)
    const tapeX = cx - 220;
    const knots = Math.round(phys.knots);
    const mach = phys.mach.toFixed(2);
    const g = phys.gForce.toFixed(1);

    // Speed Box
    ctx.strokeRect(tapeX - 45, cy - 18, 55, 36);
    ctx.font = 'bold 16px "Orbitron", sans-serif';
    ctx.fillText(`${knots}`, tapeX - 40, cy + 6);

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillText(`M ${mach}`, tapeX - 40, cy + 34);
    if (phys.isBoosting) {
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 12px "Orbitron", sans-serif';
      ctx.fillText(`BOOST`, tapeX - 40, cy + 50);
      ctx.fillStyle = this.hudColor;
    } else if (phys.airbrake > 0) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 12px "Orbitron", sans-serif';
      ctx.fillText(`AIRBRAKE`, tapeX - 40, cy + 50);
      ctx.fillStyle = this.hudColor;
    } else if (phys.isAfterburner) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 11px "Orbitron", sans-serif';
      ctx.fillText(`AB ENG`, tapeX - 40, cy + 50);
      ctx.fillStyle = this.hudColor;
    }
    ctx.fillText(`G ${g}`, tapeX - 40, cy - 30);
    ctx.fillText(`MAX ${phys.maxG.toFixed(1)}`, tapeX - 40, cy - 44);

    if (phys.isStalled) {
      ctx.fillStyle = this.hudAlertColor;
      ctx.font = 'bold 15px "Orbitron", sans-serif';
      ctx.fillText(`STALL`, tapeX - 40, cy + 60);
      ctx.fillStyle = this.hudColor;
    }

    // 2. Altitude Tape (Right)
    const altX = cx + 220;
    const altFt = Math.round(phys.altitude * 3.28084);
    const vSpeed = Math.round(phys.velocity.y * 3.28084 * 60); // ft/min

    // Alt Box
    ctx.strokeRect(altX - 10, cy - 18, 70, 36);
    ctx.font = 'bold 16px "Orbitron", sans-serif';
    ctx.fillText(`${altFt}`, altX - 4, cy + 6);

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillText(`VVI ${vSpeed > 0 ? '+' : ''}${vSpeed}`, altX - 8, cy + 34);
    ctx.fillText(`RALT ${(Math.max(0, altFt - 100))}`, altX - 8, cy - 30);
  }

  drawHeadingTape(ctx, cx, phys) {
    const euler = new THREE.Euler().setFromQuaternion(phys.quaternion, 'YXZ');
    let headingDeg = THREE.MathUtils.radToDeg(-euler.y);
    if (headingDeg < 0) headingDeg += 360;

    const tapeY = 65;
    const tapeW = 280;

    ctx.save();
    // Bounding Box
    ctx.strokeRect(cx - tapeW / 2, tapeY - 20, tapeW, 30);

    // Indicator Caret
    ctx.beginPath();
    ctx.moveTo(cx, tapeY + 14);
    ctx.lineTo(cx - 6, tapeY + 22);
    ctx.lineTo(cx + 6, tapeY + 22);
    ctx.closePath();
    ctx.fill();

    // Clip to tape width
    ctx.beginPath();
    ctx.rect(cx - tapeW / 2, tapeY - 20, tapeW, 30);
    ctx.clip();

    const pxPerDeg = 5;
    for (let deg = -30; deg <= 390; deg += 10) {
      const diff = deg - headingDeg;
      const x = cx + diff * pxPerDeg;

      if (x < cx - tapeW / 2 - 20 || x > cx + tapeW / 2 + 20) continue;

      ctx.beginPath();
      ctx.moveTo(x, tapeY + 8);
      ctx.lineTo(x, tapeY + (deg % 30 === 0 ? -4 : 2));
      ctx.stroke();

      if (deg % 30 === 0) {
        let normDeg = Math.round((deg + 360) % 360);
        let label = `${normDeg < 100 ? '0' : ''}${normDeg / 10}`;
        if (normDeg === 0) label = 'N';
        else if (normDeg === 90) label = 'E';
        else if (normDeg === 180) label = 'S';
        else if (normDeg === 270) label = 'W';

        ctx.fillText(label, x - 5, tapeY - 8);
      }
    }
    ctx.restore();
  }

  drawTargetHUD(ctx, player, target, weaponManager) {
    if (!target || target.isDead) return;

    const screenPos = this.worldToScreen(target.position);
    if (!screenPos.visible) return;

    const tx = screenPos.x;
    const ty = screenPos.y;
    const distMeters = Math.round(player.position.distanceTo(target.position));
    const distNM = (distMeters / 1852).toFixed(1);

    ctx.save();

    // 1. Target Designator (TD) Box
    const boxSize = Math.max(22, Math.min(65, (1200 / distMeters) * 45));
    ctx.strokeStyle = weaponManager.lockState === 'locked' ? '#ff3355' : this.hudColor;
    ctx.lineWidth = 2.0;

    // Corner brackets
    const bLen = boxSize * 0.35;
    const half = boxSize / 2;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(tx - half, ty - half + bLen);
    ctx.lineTo(tx - half, ty - half);
    ctx.lineTo(tx - half + bLen, ty - half);

    // Top-Right
    ctx.moveTo(tx + half - bLen, ty - half);
    ctx.lineTo(tx + half, ty - half);
    ctx.lineTo(tx + half, ty - half + bLen);

    // Bottom-Left
    ctx.moveTo(tx - half, ty + half - bLen);
    ctx.lineTo(tx - half, ty + half);
    ctx.lineTo(tx - half + bLen, ty + half);

    // Bottom-Right
    ctx.moveTo(tx + half - bLen, ty + half);
    ctx.lineTo(tx + half, ty + half);
    ctx.lineTo(tx + half, ty + half - bLen);
    ctx.stroke();

    // Target Telemetry Tag
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillText(`${target.callsign || 'BANDIT'}`, tx + half + 6, ty - half + 10);
    ctx.fillText(`${distMeters} M (${distNM} NM)`, tx + half + 6, ty - half + 24);

    // 2. Missile Lock Reticle
    if (weaponManager.lockState === 'locked') {
      ctx.beginPath();
      ctx.arc(tx, ty, boxSize * 0.8, 0, Math.PI * 2);
      ctx.stroke();

      // Flashing "SHOOT" Cue
      if (Math.sin(performance.now() * 0.012) > 0) {
        ctx.fillStyle = '#ff2244';
        ctx.font = 'bold 16px "Orbitron", sans-serif';
        ctx.fillText('SHOOT', tx - 28, ty + half + 26);
      }
    } else if (weaponManager.lockState === 'tracking') {
      // Animated acquiring reticle
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(tx, ty, boxSize * 1.1, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Lead Computing Optical Gunsight (LCOS)
    const leadPos = weaponManager.calculateLeadReticle(player.position, player.velocity, target.position, target.velocity);
    if (leadPos) {
      const leadScreen = this.worldToScreen(leadPos);
      if (leadScreen.visible) {
        ctx.strokeStyle = '#ffee44';
        ctx.fillStyle = '#ffee44';
        ctx.setLineDash([]);

        // Small lead pipper dot and circle
        ctx.beginPath();
        ctx.arc(leadScreen.x, leadScreen.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(leadScreen.x, leadScreen.y, 14, 0, Math.PI * 2);
        ctx.stroke();

        // Line connecting target to lead pipper
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.moveTo(tx, ty);
        ctx.lineTo(leadScreen.x, leadScreen.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  drawThreatWarning(ctx, cx, cy) {
    if (Math.sin(performance.now() * 0.015) > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff2244';
      ctx.fillStyle = '#ff2244';
      ctx.font = 'bold 20px "Orbitron", sans-serif';
      ctx.fillText('⚠ BANDIT ON YOUR SIX - EVADE ⚠', cx - 190, cy - 140);
      ctx.restore();
    }
  }

  drawPerimeterWarning(ctx, cx, cy, dist) {
    const isCritical = dist >= 3780;
    const flash = Math.sin(performance.now() * 0.015) > 0;
    if (flash || isCritical) {
      ctx.save();
      ctx.fillStyle = isCritical ? '#ff1133' : '#ffaa00';
      ctx.font = 'bold 18px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      const rem = Math.max(0, Math.round(3800 - dist));
      const text = isCritical
        ? '🚨 COMBAT PERIMETER EXCEEDED // AUTONOMOUS DEFLECTION ACTIVE 🚨'
        : `⚠️ WARNING: APPROACHING COMBAT PERIMETER [${rem}M] // TURN BACK ⚠️`;
      ctx.fillText(text, cx, cy - 180);
      ctx.restore();
    }
  }

  // 360-Degree Tactical CRT Radar
  renderRadar(player, enemies = [], missiles = []) {
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const rcx = w / 2;
    const rcy = h / 2;
    const radarRadius = w / 2 - 8;

    ctx.clearRect(0, 0, w, h);

    // Range: 15 km scale
    const radarRange = 15000;
    const scale = radarRadius / radarRange;

    // Radar Concentric Range Rings
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.35)';
    ctx.lineWidth = 1;
    for (let r = 0.33; r <= 1.0; r += 0.33) {
      ctx.beginPath();
      ctx.arc(rcx, rcy, radarRadius * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(rcx, rcy - radarRadius);
    ctx.lineTo(rcx, rcy + radarRadius);
    ctx.moveTo(rcx - radarRadius, rcy);
    ctx.lineTo(rcx + radarRadius, rcy);
    ctx.stroke();

    // Player Heading Rotation
    const euler = new THREE.Euler().setFromQuaternion(player.quaternion, 'YXZ');
    const playerHeading = -euler.y;

    // Player Jet Center Icon
    ctx.fillStyle = '#00ffaa';
    ctx.beginPath();
    ctx.moveTo(rcx, rcy - 5);
    ctx.lineTo(rcx - 4, rcy + 4);
    ctx.lineTo(rcx + 4, rcy + 4);
    ctx.closePath();
    ctx.fill();

    // Plot Hostile Enemies
    ctx.fillStyle = '#ff3355';
    for (const enemy of enemies) {
      if (!enemy || enemy.isDead) continue;
      const dx = enemy.position.x - player.position.x;
      const dz = enemy.position.z - player.position.z;

      // Rotate to aircraft heading reference (Top is plane forward)
      const rx = dx * Math.cos(playerHeading) - dz * Math.sin(playerHeading);
      const rz = dx * Math.sin(playerHeading) + dz * Math.cos(playerHeading);

      const px = rcx + rx * scale;
      const py = rcy + rz * scale;

      // Distance check inside radar circle
      const d = Math.hypot(px - rcx, py - rcy);
      if (d <= radarRadius) {
        ctx.beginPath();
        // Diamond contact
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px + 4, py);
        ctx.lineTo(px, py + 4);
        ctx.lineTo(px - 4, py);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Plot In-Flight Missiles
    ctx.fillStyle = '#ffcc00';
    for (const msl of missiles) {
      if (!msl || msl.isDead) continue;
      const dx = msl.position.x - player.position.x;
      const dz = msl.position.z - player.position.z;

      const rx = dx * Math.cos(playerHeading) - dz * Math.sin(playerHeading);
      const rz = dx * Math.sin(playerHeading) + dz * Math.cos(playerHeading);

      const px = rcx + rx * scale;
      const py = rcy + rz * scale;

      const d = Math.hypot(px - rcx, py - rcy);
      if (d <= radarRadius) {
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Plot Quantum Warp Portal on Radar Screen
    if (activePortal) {
      const pPos = activePortal.position;
      const dx = pPos.x - player.position.x;
      const dz = pPos.z - player.position.z;

      const rx = dx * Math.cos(playerHeading) - dz * Math.sin(playerHeading);
      const rz = dx * Math.sin(playerHeading) + dz * Math.cos(playerHeading);

      const px = rcx + rx * scale;
      const py = rcy + rz * scale;

      const d = Math.hypot(px - rcx, py - rcy);
      if (d <= radarRadius) {
        ctx.strokeStyle = '#00e5ff';
        ctx.fillStyle = '#00e5ff';
        ctx.lineWidth = 1.5;

        // Pulsing portal ring blip
        const pulse = 4 + Math.sin(performance.now() * 0.008) * 1.5;
        ctx.beginPath();
        ctx.arc(px, py, pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rotating Radar Sweep Beam
    const sweepAngle = (performance.now() * 0.002) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.4)';
    ctx.beginPath();
    ctx.moveTo(rcx, rcy);
    ctx.lineTo(rcx + Math.cos(sweepAngle) * radarRadius, rcy + Math.sin(sweepAngle) * radarRadius);
    ctx.stroke();
  }

  // 3D Waypoint HUD reticle for Quantum Warp Portal & Starting Island Takeoff Cues
  drawPortalHUD(ctx, player, portal, currentAirspace) {
    const portalPos = portal.position;
    const distMeters = player.position.distanceTo(portalPos);
    const distKm = (distMeters / 1000).toFixed(1);

    const screenPos = this.worldToScreen(portalPos);
    const isHome = currentAirspace === 'HOME_BASE';
    const tag = isHome ? 'WARP PORTAL' : 'HOME EXTRACTION GATE';
    const col = isHome ? '#00e5ff' : '#ffaa00';

    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;

    if (screenPos.visible && screenPos.x > 30 && screenPos.x < this.width - 30 &&
        screenPos.y > 30 && screenPos.y < this.height - 30) {
      const x = screenPos.x;
      const y = screenPos.y;
      const size = Math.max(20, Math.min(54, (1400 / distMeters) * 38));

      // Animated pulsing diamond reticle
      const pulse = 1.0 + Math.sin(performance.now() * 0.008) * 0.15;
      const s = size * pulse;

      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.stroke();

      // Inner singularity pip
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Text label and distance
      ctx.font = '11px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${tag} [${distKm} km]`, x, y + s + 16);

      if (distMeters < 900) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Share Tech Mono", monospace';
        ctx.fillText('>> ENTER PORTAL TO WARP <<', x, y - s - 8);
      }
    } else {
      // Off-screen indicator chevron pointing toward portal
      const dx = portalPos.x - player.position.x;
      const dz = portalPos.z - player.position.z;
      const playerHeading = Math.atan2(player.forward.x, player.forward.z);
      const angleToPortal = Math.atan2(dx, dz) - playerHeading;

      const r = Math.min(this.cx, this.cy) * 0.78;
      const ax = this.cx + Math.sin(angleToPortal) * r;
      const ay = this.cy - Math.cos(angleToPortal) * r;

      ctx.beginPath();
      ctx.arc(ax, ay, 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '10px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${tag} [${distKm}km]`, ax, ay + 20);
    }

    // Takeoff & Portal guidance cues
    if (isHome && player.position.y < 75) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.95)';
      ctx.font = 'bold 15px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲ RUNWAY 36 // HOLD [SHIFT] TO ACCELERATE & ROTATE UP [S] ▲', this.cx, this.cy + 130);
      ctx.font = '12px "Share Tech Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SPEED INCREASES EXPONENTIALLY // RELEASE [SHIFT] TO STOP THROTTLE', this.cx, this.cy + 152);
    } else if (!isHome) {
      // Hostile island ground portal cue
      ctx.font = '12px "Share Tech Mono", monospace';
      ctx.fillStyle = 'rgba(255, 170, 0, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ RETURN TO BASE: FLY INTO GROUND-LEVEL WARP PORTAL ON ISLAND RUNWAY ⚡', this.cx, 48);
    }

    ctx.restore();
  }
}
