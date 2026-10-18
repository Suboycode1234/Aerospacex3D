import * as THREE from 'three';

/**
 * BakedLightingSystem
 * 
 * Implements Time-of-Day Dual-Lightmap Blending & Pre-baked Plane Radiance Reflections
 * with ZERO real-time raytracing hardware overhead.
 * 
 * - Master Clock: currentTime (24-hr format e.g. 14.50 = 2:30 PM), timeScale
 * - 4 Baked Phases:
 *     0: Dawn / Morning (06:00)
 *     1: Noon / Midday  (12:00)
 *     2: Dusk / Sunset  (18:00)
 *     3: Night / Midnight (24:00)
 * - Phase Evaluator: Calculates currentLightmapA, currentLightmapB, and blendFactor (0.0 to 1.0)
 * - Lerp Shader: FinalColor = LightmapA * (1.0 - blendFactor) + LightmapB * blendFactor
 * - Baked Aircraft Radiance Reflections: High-gloss equirectangular environment probe
 *   dynamically reflecting time-of-day sky, horizon bounce, and sun disc.
 */
export class BakedLightingSystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // 1. Master Clock Variables (User Specification)
    this.currentTime = 14.0; // Starts at 2:00 PM (Bright daylight afternoon)
    this.timeScale = 60.0;    // 60.0 = 1 real minute = 1 in-game hour (full day in 24 min)
    this.isPaused = false;

    // Current lightmap pointers & blendFactor
    this.currentLightmapA = null;
    this.currentLightmapB = null;
    this.blendFactor = 0.0;
    this.currentPhaseIndex = -1;

    // Shader Uniforms shared across terrain materials
    this.shaderUniforms = {
      lightmapA: { value: null },
      lightmapB: { value: null },
      blendFactor: { value: 0.0 },
    };

    // 2. Pre-bake 4 High-Fidelity Lightmaps for the Island & Terrain
    this.lightmaps = {
      dawn: this.bakeIslandLightmap('dawn'),
      noon: this.bakeIslandLightmap('noon'),
      dusk: this.bakeIslandLightmap('dusk'),
      night: this.bakeIslandLightmap('night'),
    };

    // 3. Pre-bake 4 Aircraft Radiance Reflection Maps for Aircraft Skin & Canopy
    this.envCanvas = document.createElement('canvas');
    this.envCanvas.width = 512;
    this.envCanvas.height = 256;
    this.envCtx = this.envCanvas.getContext('2d');
    this.envTexture = new THREE.CanvasTexture(this.envCanvas);
    this.envTexture.mapping = THREE.EquirectangularReflectionMapping;
    this.envTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.environment = this.envTexture;

    // 4. Time Phase Definitions (in 24-hr format)
    this.phases = [
      { id: 'dawn',  name: 'DAWN',   time: 6.0,  lightmap: this.lightmaps.dawn },
      { id: 'noon',  name: 'NOON',   time: 12.0, lightmap: this.lightmaps.noon },
      { id: 'dusk',  name: 'DUSK',   time: 18.0, lightmap: this.lightmaps.dusk },
      { id: 'night', name: 'NIGHT',  time: 24.0, lightmap: this.lightmaps.night },
    ];

    // Initial evaluation
    this.evaluatePhase(true);
    this.updateReflectionMap();
  }

  /**
   * Pre-bakes a high-resolution 512x512 directional GI lightmap for the island & airbase
   * simulating soft ambient occlusion, mountain cast shadows, and runway radiance.
   */
  bakeIslandLightmap(phase) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    if (phase === 'dawn') {
      // Dawn (06:00): Warm morning sunlight from the East, soft shadows
      ctx.fillStyle = '#b0b8c8'; // Clean morning ambient
      ctx.fillRect(0, 0, size, size);

      // Warm directional sunlight from East
      const sunGrad = ctx.createLinearGradient(size, cy, 0, cy);
      sunGrad.addColorStop(0.0, 'rgba(255, 215, 160, 0.95)'); // Warm sunrise gold
      sunGrad.addColorStop(0.4, 'rgba(255, 195, 140, 0.65)');
      sunGrad.addColorStop(1.0, 'rgba(160, 175, 205, 0.35)'); // Soft ambient fill
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, size, size);

      // Central island mountain soft shadow
      const mtnGrad = ctx.createRadialGradient(cx + 40, cy, 30, cx, cy, 220);
      mtnGrad.addColorStop(0.0, 'rgba(255, 225, 170, 0.35)');
      mtnGrad.addColorStop(0.7, 'rgba(150, 165, 195, 0.25)');
      mtnGrad.addColorStop(1.0, 'rgba(130, 145, 175, 0.35)');
      ctx.fillStyle = mtnGrad;
      ctx.fillRect(0, 0, size, size);

      // Runway morning sheen
      ctx.fillStyle = 'rgba(255, 230, 180, 0.25)';
      ctx.fillRect(cx - 18, 40, 36, size - 80);

    } else if (phase === 'noon') {
      // Noon (12:00): High overhead sun, full crisp bright illumination
      ctx.fillStyle = '#e8f0f8'; // Bright daylight fill
      ctx.fillRect(0, 0, size, size);

      // Intense overhead sunlight
      const sunGrad = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, 240);
      sunGrad.addColorStop(0.0, 'rgba(255, 255, 250, 1.0)');  // Pure bright sun
      sunGrad.addColorStop(0.5, 'rgba(250, 252, 255, 0.92)');
      sunGrad.addColorStop(1.0, 'rgba(220, 235, 250, 0.82)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, size, size);

      // Subtle terrain valley ambient occlusion
      const mtnOcclusion = ctx.createRadialGradient(cx, cy, 60, cx, cy, 220);
      mtnOcclusion.addColorStop(0.0, 'rgba(255, 255, 255, 0.15)');
      mtnOcclusion.addColorStop(0.8, 'rgba(180, 200, 220, 0.15)');
      mtnOcclusion.addColorStop(1.0, 'rgba(150, 170, 195, 0.25)');
      ctx.fillStyle = mtnOcclusion;
      ctx.fillRect(0, 0, size, size);

      // Bright daylight on runway
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(cx - 18, 40, 36, size - 80);

    } else if (phase === 'dusk') {
      // Dusk / Sunset (18:00): Warm fiery glance from West, long shadows East
      ctx.fillStyle = '#b8a098'; // Warm twilight ambient
      ctx.fillRect(0, 0, size, size);

      // Sunset sweep from West
      const sunGrad = ctx.createLinearGradient(0, cy, size, cy);
      sunGrad.addColorStop(0.0, 'rgba(255, 160, 90, 0.95)');   // Golden-hour amber
      sunGrad.addColorStop(0.4, 'rgba(255, 180, 120, 0.65)');
      sunGrad.addColorStop(0.85, 'rgba(170, 140, 180, 0.35)');  // Violet twilight
      sunGrad.addColorStop(1.0, 'rgba(130, 110, 150, 0.45)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, size, size);

      // Mountain ridge backlight
      const ridgeGrad = ctx.createRadialGradient(cx - 50, cy, 20, cx, cy, 220);
      ridgeGrad.addColorStop(0.0, 'rgba(255, 180, 110, 0.45)');
      ridgeGrad.addColorStop(0.6, 'rgba(150, 120, 160, 0.25)');
      ridgeGrad.addColorStop(1.0, 'rgba(110, 90, 130, 0.35)');
      ctx.fillStyle = ridgeGrad;
      ctx.fillRect(0, 0, size, size);

      // Runway twilight reflection
      ctx.fillStyle = 'rgba(255, 160, 90, 0.25)';
      ctx.fillRect(cx - 18, 40, 36, size - 80);

    } else if (phase === 'night') {
      // Night (24:00): Cool moonlight + glowing runway airbase lights
      ctx.fillStyle = '#3a4a68'; // Deep night ambient
      ctx.fillRect(0, 0, size, size);

      // Cool silver moon illumination
      const moonGrad = ctx.createRadialGradient(cx - 60, cy - 60, 30, cx, cy, 250);
      moonGrad.addColorStop(0.0, 'rgba(170, 195, 240, 0.45)'); // Silver moon glint
      moonGrad.addColorStop(0.7, 'rgba(60, 75, 110, 0.35)');
      moonGrad.addColorStop(1.0, 'rgba(40, 50, 75, 0.45)');
      ctx.fillStyle = moonGrad;
      ctx.fillRect(0, 0, size, size);

      // BAKED RUNWAY AIRSTRIP LIGHTING: High-intensity neon green & cyan ground illumination
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#00ffaa';
      ctx.fillStyle = 'rgba(0, 255, 170, 0.85)';
      // Centerline dots
      for (let y = 50; y < size - 50; y += 24) {
        ctx.beginPath();
        ctx.arc(cx, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Runway Edge Lights (Cyan)
      ctx.shadowColor = '#00e5ff';
      ctx.fillStyle = 'rgba(0, 229, 255, 0.90)';
      for (let y = 45; y < size - 45; y += 28) {
        ctx.fillRect(cx - 18, y, 2.5, 4);
        ctx.fillRect(cx + 15.5, y, 2.5, 4);
      }

      // Perimeter glowing red hazard beacons
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff2255';
      ctx.fillStyle = 'rgba(255, 34, 85, 0.75)';
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const bx = cx + Math.cos(angle) * 210;
        const by = cy + Math.sin(angle) * 210;
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Updates pre-baked aircraft radiance reflections (Equirectangular Sky & Horizon Probe)
   * The aircraft titanium fuselage, glass canopy, and wing surfaces reflect the exact
   * time-of-day sky, sun glint, and terrain horizon with zero hardware raytracing cost.
   */
  updateReflectionMap() {
    const ctx = this.envCtx;
    const w = this.envCanvas.width;
    const h = this.envCanvas.height;

    // Palette interpolation based on currentTime
    const colors = this.getEnvironmentColors(this.currentTime);

    // 1. Sky & Ground Hemisphere Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0.0, colors.zenith);   // Overhead high sky
    skyGrad.addColorStop(0.44, colors.skyMid);  // Mid sky
    skyGrad.addColorStop(0.50, colors.horizon); // Bright horizon band
    skyGrad.addColorStop(0.52, colors.ground);  // Ground / ocean bounce
    skyGrad.addColorStop(1.0, colors.nadir);   // Deep ocean below
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Baked Sun / Moon Specular Glare Disc
    if (colors.sunAlpha > 0.05) {
      const sunX = (colors.sunAzimuth / 360) * w;
      const sunY = (1.0 - colors.sunElevation / 90) * (h * 0.5);

      const sunGlow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 45);
      sunGlow.addColorStop(0.0, colors.sunColor);
      sunGlow.addColorStop(0.3, colors.sunHalo);
      sunGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Baked Glass Canopy Reflection Streaks (Interior cockpit & canopy fresnel)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, h * 0.48, w, 2.5); // Sharp horizon reflection line across glass

    this.envTexture.needsUpdate = true;
  }

  /**
   * Returns interpolated aesthetic colors for the sky dome, sun, and aircraft reflections
   */
  getEnvironmentColors(time) {
    // 0: Dawn (06:00), 1: Noon (12:00), 2: Dusk (18:00), 3: Night (24:00)
    if (time >= 6.0 && time < 12.0) {
      // Dawn -> Noon
      const f = (time - 6.0) / 6.0;
      return {
        zenith: this.lerpColor('#10254c', '#083a78', f),
        skyMid: this.lerpColor('#4a6f9c', '#4080c8', f),
        horizon: this.lerpColor('#ffaa60', '#b8d8f8', f),
        ground: this.lerpColor('#1a3028', '#0b2e48', f),
        nadir: '#061a28',
        sunColor: this.lerpColor('rgba(255, 200, 110, 1.0)', 'rgba(255, 255, 240, 1.0)', f),
        sunHalo: this.lerpColor('rgba(255, 140, 60, 0.45)', 'rgba(255, 250, 200, 0.35)', f),
        sunAlpha: 1.0,
        sunAzimuth: 70 + f * 50,
        sunElevation: 12 + f * 62,
        sunLightColor: this.lerpColor('#ffb070', '#fff8ee', f),
        sunIntensity: 1.8 + f * 0.8,
        ambientColor: this.lerpColor('#4a5d7c', '#b0d4ff', f),
        ambientIntensity: 0.85 + f * 0.35,
        fogColor: this.lerpColor('#a8b8cc', '#8ebae5', f),
      };
    } else if (time >= 12.0 && time < 18.0) {
      // Noon -> Dusk
      const f = (time - 12.0) / 6.0;
      return {
        zenith: this.lerpColor('#083a78', '#201538', f),
        skyMid: this.lerpColor('#4080c8', '#683558', f),
        horizon: this.lerpColor('#b8d8f8', '#ff6528', f),
        ground: this.lerpColor('#0b2e48', '#2a1a24', f),
        nadir: '#061a28',
        sunColor: this.lerpColor('rgba(255, 255, 240, 1.0)', 'rgba(255, 120, 40, 1.0)', f),
        sunHalo: this.lerpColor('rgba(255, 250, 200, 0.35)', 'rgba(255, 70, 20, 0.55)', f),
        sunAlpha: 1.0,
        sunAzimuth: 120 + f * 140,
        sunElevation: 74 - f * 64,
        sunLightColor: this.lerpColor('#fff8ee', '#ff6622', f),
        sunIntensity: 2.6 - f * 0.7,
        ambientColor: this.lerpColor('#b0d4ff', '#5a4066', f),
        ambientIntensity: 1.2 - f * 0.4,
        fogColor: this.lerpColor('#8ebae5', '#b86650', f),
      };
    } else if (time >= 18.0 && time < 24.0) {
      // Dusk -> Night
      const f = (time - 18.0) / 6.0;
      return {
        zenith: this.lerpColor('#201538', '#040916', f),
        skyMid: this.lerpColor('#683558', '#081228', f),
        horizon: this.lerpColor('#ff6528', '#142240', f),
        ground: this.lerpColor('#2a1a24', '#060c18', f),
        nadir: '#020610',
        sunColor: this.lerpColor('rgba(255, 120, 40, 0.8)', 'rgba(160, 195, 255, 0.65)', f),
        sunHalo: this.lerpColor('rgba(255, 70, 20, 0.3)', 'rgba(90, 130, 220, 0.25)', f),
        sunAlpha: 1.0 - f * 0.5,
        sunAzimuth: 260 + f * 40,
        sunElevation: Math.max(2, 10 - f * 30),
        sunLightColor: this.lerpColor('#ff6622', '#7895d0', f),
        sunIntensity: Math.max(0.35, 1.9 - f * 1.55),
        ambientColor: this.lerpColor('#5a4066', '#142038', f),
        ambientIntensity: 0.8 - f * 0.45,
        fogColor: this.lerpColor('#b86650', '#0a1426', f),
      };
    } else {
      // Night -> Dawn (00:00 to 06:00)
      const f = time / 6.0;
      return {
        zenith: this.lerpColor('#040916', '#10254c', f),
        skyMid: this.lerpColor('#081228', '#4a6f9c', f),
        horizon: this.lerpColor('#142240', '#ffaa60', f),
        ground: this.lerpColor('#060c18', '#1a3028', f),
        nadir: '#020610',
        sunColor: this.lerpColor('rgba(160, 195, 255, 0.65)', 'rgba(255, 200, 110, 1.0)', f),
        sunHalo: this.lerpColor('rgba(90, 130, 220, 0.25)', 'rgba(255, 140, 60, 0.45)', f),
        sunAlpha: 0.5 + f * 0.5,
        sunAzimuth: 300 + f * 130,
        sunElevation: Math.max(2, -20 + f * 32),
        sunLightColor: this.lerpColor('#7895d0', '#ffb070', f),
        sunIntensity: 0.35 + f * 1.45,
        ambientColor: this.lerpColor('#142038', '#4a5d7c', f),
        ambientIntensity: 0.35 + f * 0.5,
        fogColor: this.lerpColor('#0a1426', '#a8b8cc', f),
      };
    }
  }

  lerpColor(c1, c2, t) {
    const col1 = new THREE.Color(c1);
    const col2 = new THREE.Color(c2);
    col1.lerp(col2, t);
    return '#' + col1.getHexString();
  }

  /**
   * Phase Evaluator:
   * Maps abstract currentTime (0-24) to the active bracket pair [LightmapA, LightmapB]
   * and calculates the exact blendFactor percentage (0.0 to 1.0)
   */
  evaluatePhase(force = false) {
    let t = this.currentTime % 24.0;
    if (t < 0) t += 24.0;

    let idxA = 0;
    let idxB = 1;
    let blend = 0.0;

    if (t >= 6.0 && t < 12.0) {
      idxA = 0; // Dawn
      idxB = 1; // Noon
      blend = (t - 6.0) / 6.0;
    } else if (t >= 12.0 && t < 18.0) {
      idxA = 1; // Noon
      idxB = 2; // Dusk
      blend = (t - 12.0) / 6.0;
    } else if (t >= 18.0 && t < 24.0) {
      idxA = 2; // Dusk
      idxB = 3; // Night
      blend = (t - 18.0) / 6.0;
    } else {
      idxA = 3; // Night
      idxB = 0; // Dawn
      blend = (t < 6.0 ? t : 0.0) / 6.0;
    }

    blend = Math.max(0.0, Math.min(1.0, blend));
    this.blendFactor = blend;

    // Trigger OnTimeThresholdPassed event when crossing bracket threshold
    if (idxA !== this.currentPhaseIndex || force) {
      this.currentPhaseIndex = idxA;
      this.currentLightmapA = this.phases[idxA].lightmap;
      this.currentLightmapB = this.phases[idxB].lightmap;
      this.shaderUniforms.lightmapA.value = this.currentLightmapA;
      this.shaderUniforms.lightmapB.value = this.currentLightmapB;
    }

    this.shaderUniforms.blendFactor.value = this.blendFactor;
  }

  /**
   * Hook material with the Master Baked Lightmap Dual-Lerp Shader Chunk
   * Master Formula running on GPU:
   * FinalColor = LightmapA * (1.0 - blendFactor) + LightmapB * blendFactor
   */
  applyToMaterial(material) {
    if (!material) return;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.bakedLightmapA = this.shaderUniforms.lightmapA;
      shader.uniforms.bakedLightmapB = this.shaderUniforms.lightmapB;
      shader.uniforms.bakedBlendFactor = this.shaderUniforms.blendFactor;

      shader.vertexShader = `
        varying vec2 vBakedUv;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vBakedUv = uv;
        `
      );

      shader.fragmentShader = `
        varying vec2 vBakedUv;
        uniform sampler2D bakedLightmapA;
        uniform sampler2D bakedLightmapB;
        uniform float bakedBlendFactor;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        vec4 lA = texture2D(bakedLightmapA, vBakedUv);
        vec4 lB = texture2D(bakedLightmapB, vBakedUv);
        vec3 bakedGI = mix(lA.rgb, lB.rgb, bakedBlendFactor);
        
        // Preserve vivid natural albedo while applying time-of-day irradiance & shadow factor:
        float giBrightness = dot(bakedGI, vec3(0.299, 0.587, 0.114));
        vec3 giTone = mix(vec3(1.0), bakedGI, 0.35);
        gl_FragColor.rgb *= (giTone * (0.65 + giBrightness * 0.70));
        `
      );
    };

    material.needsUpdate = true;
  }

  /**
   * OnUpdateTick:
   * Increments currentTime smoothly each frame: currentTime += dt * (timeScale / 3600)
   * Updates blendFactor and aircraft reflections
   */
  update(dt, world) {
    if (!this.isPaused) {
      // timeScale: 60 means 1 real minute = 1 in-game hour (0.01666 hrs per sec)
      const hoursPerSec = this.timeScale / 3600.0;
      this.currentTime = (this.currentTime + dt * hoursPerSec) % 24.0;
      if (this.currentTime < 0) this.currentTime += 24.0;
    }

    // Evaluate Phase and update GPU blendFactor
    this.evaluatePhase();

    // Update aircraft baked reflection map (throttle canvas redrawing to ~10 times per sec for max performance)
    this._reflTimer = (this._reflTimer || 0) + dt;
    if (this._reflTimer > 0.08) {
      this._reflTimer = 0;
      this.updateReflectionMap();
    }

    // Sync World Lighting and Sky with the Time-of-Day
    if (world) {
      this.syncWorldLighting(world);
    }
  }

  /**
   * Sets the game clock directly (e.g. from user Settings slider)
   */
  setTime(hours) {
    this.currentTime = Math.max(0.0, Math.min(24.0, hours)) % 24.0;
    this.evaluatePhase(true);
    this.updateReflectionMap();
  }

  /**
   * Synchronizes dynamic directional sunlight, fog, and sky dome colors to match currentTime
   */
  syncWorldLighting(world) {
    const colors = this.getEnvironmentColors(this.currentTime);

    // 1. Sun Light Position & Color
    if (world.sunLight) {
      const azRad = THREE.MathUtils.degToRad(colors.sunAzimuth);
      const elRad = THREE.MathUtils.degToRad(colors.sunElevation);
      const dist = 8000;
      const sx = Math.cos(azRad) * Math.cos(elRad) * dist;
      const sy = Math.sin(elRad) * dist;
      const sz = Math.sin(azRad) * Math.cos(elRad) * dist;

      world.sunLight.position.set(sx, sy, sz);
      world.sunLight.color.set(colors.sunLightColor);
      world.sunLight.intensity = colors.sunIntensity;
    }

    // 2. Ambient & Hemisphere Light
    if (world.ambientLight) {
      world.ambientLight.color.set(colors.ambientColor);
      world.ambientLight.intensity = colors.ambientIntensity;
    }
    if (world.hemiLight) {
      world.hemiLight.color.set(colors.skyMid);
      world.hemiLight.groundColor.set(colors.ground);
    }

    // 3. Fog and Sky Dome
    if (world.scene && world.scene.fog) {
      world.scene.fog.color.set(colors.fogColor);
      world.scene.background = new THREE.Color(colors.skyMid);
    }
  }

  /**
   * Formats time into 24-hr clock string: e.g. "14:30 [NOON]"
   */
  getFormattedTime() {
    const totalMinutes = Math.floor(this.currentTime * 60);
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    const hh = String(hrs).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');

    let phaseName = 'NOON';
    if (this.currentTime >= 5.0 && this.currentTime < 9.0) phaseName = 'DAWN';
    else if (this.currentTime >= 9.0 && this.currentTime < 16.5) phaseName = 'NOON';
    else if (this.currentTime >= 16.5 && this.currentTime < 20.5) phaseName = 'DUSK';
    else phaseName = 'NIGHT';

    return {
      clock: `${hh}:${mm}`,
      phase: phaseName,
      hours: this.currentTime,
    };
  }
}
