import * as THREE from 'three';
import { FlightModel } from './physics/FlightModel.js';
import { ModelLoader } from './entities/ModelLoader.js';
import { Airplane } from './entities/Airplane.js';
import { EnemyAI } from './entities/EnemyAI.js';
import { WeaponManager } from './weapons/WeaponManager.js';
import { World } from './environment/World.js';
import { HUD } from './ui/HUD.js';
import { SoundSystem } from './audio/SoundSystem.js';

// Main Flight Simulator Engine
class FlightSimulatorApp {
  constructor() {
    this.canvas = document.getElementById('three-canvas');
    this.hudCanvas = document.getElementById('hud-canvas');
    this.radarCanvas = document.getElementById('radar-canvas');
    this.gforceOverlay = document.getElementById('gforce-overlay');

    // Stats and Kills
    this.kills = 0;
    this.missilesFired = 0;
    this.startTime = performance.now();

    // Menu State: Game only starts when player launches from menu
    this.gameStarted = false;
    this.selectedPlaneType = 'f16';
    this.menuOrbitAngle = 0;
    this.hostilesDisabled = false;

    // Settings
    this.mouseFlightEnabled = false; // Pure, crisp keyboard flight by default (no phantom mouse drift)
    this.invertPitch = false;
    this.cameraMode = 'CHASE'; // 'CHASE', 'COCKPIT', 'FLYBY'

    // FPS Counter Tracking
    this.fpsFrames = 0;
    this.lastFpsTime = performance.now();

    // Init Three.js
    this.setupThree();

    // Systems
    this.sound = new SoundSystem();
    this.modelLoader = new ModelLoader();
    this.world = new World(this.scene, this.renderer, this.sound);
    this.player = new Airplane(this.scene, this.modelLoader);
    this.weaponManager = new WeaponManager(this.scene, this.sound, this.modelLoader);
    this.hud = new HUD(this.hudCanvas, this.radarCanvas, this.camera);

    // Airspace State: 'HOME_BASE' (Peaceful starting island) or 'HOSTILE_AIRSPACE' (Combat sector)
    this.airspaceZone = 'HOME_BASE';
    if (this.world && this.world.portalSystem) {
      this.world.portalSystem.onWarpTriggered = (e) => this.handleWarpTransition(e);
    }

    // Initial enemy array (zero enemies on home island!)
    this.enemies = [];

    // Controls State
    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.isRightMouseDown = false;
    this.isFiringGun = false;

    // Place aircraft on runway for hangar preview
    this.player.reset(new THREE.Vector3(0, 39, 0), 0);

    // Setup Listeners and UI
    this.setupInputs();
    this.setupUI();

    // Mark UI layer as in-menu initially
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.classList.add('in-menu');

    // Kick off Async 3D Model Loading from User Files
    this.loadUserModels();

    // Animation Loop
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupThree() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.5,
      60000
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Raytraced-Style Physically Based Environment Lighting & Reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const envSkyGeo = new THREE.SphereGeometry(100, 16, 16);
    envSkyGeo.scale(-1, 1, 1);
    const envMat = new THREE.MeshBasicMaterial({
      color: 0x82b8f0,
      side: THREE.BackSide,
    });
    const envMesh = new THREE.Mesh(envSkyGeo, envMat);
    envScene.add(envMesh);

    // Glowing Sun point for sharp specular glints off fuselage
    const sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(8, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sunOrb.position.set(40, 70, 30);
    envScene.add(sunOrb);

    const envMap = pmremGenerator.fromScene(envScene).texture;
    this.scene.environment = envMap;

    // Flyby Camera Reference
    this.flybyPosition = new THREE.Vector3(0, 1600, -200);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  async loadUserModels() {
    console.log('[Main] Loading aircraft fleet & ordnance models...');
    try {
      // 1. Load F-16 Fighting Falcon GLB
      await this.modelLoader.loadJetGLB('./models/jets/F-16.glb', 'f16', 15.0, false);
      console.log('[Main] F-16 Fighting Falcon ready in hangar!');
    } catch (e) {
      console.warn('[Main] F-16 load notice:', e);
    }

    try {
      // 2. Load Eurofighter Typhoon GLB
      await this.modelLoader.loadJetGLB('./models/jets/TyphoonOne.glb', 'typhoon', 16.0, false);
      console.log('[Main] Eurofighter Typhoon ready in hangar!');
    } catch (e) {
      console.warn('[Main] Typhoon load notice:', e);
    }

    try {
      // 3. Load Rapid Shadow FBX
      await this.modelLoader.loadJetFBX(
        './models/fighter-jet/source/RapidShadow.fbx',
        './models/fighter-jet/textures/TEXTURE.jpg'
      );
      console.log('[Main] Rapid Shadow ready in hangar!');
    } catch (e) {
      console.warn('[Main] RapidShadow load notice:', e);
    }

    try {
      // 4. Load Guided Missile FBX
      await this.modelLoader.loadMissileFBX(
        './models/missile/source/rocket2.fbx',
        './models/missile/textures/rocket2_body_BaseColor.png'
      );
      console.log('[Main] AIM-9 Sidewinder ordnance ready!');
    } catch (e) {
      console.warn('[Main] Missile load notice:', e);
    }

    // Refresh player mesh with selected aircraft model
    if (this.player) {
      this.player.setAircraftModel(this.selectedPlaneType);
    }
  }

  spawnEnemies(count = 8, center = new THREE.Vector3(0, 1600, -8200)) {
    // Starting island is strictly peaceful - only spawn enemies in hostile airspace
    if (this.airspaceZone !== 'HOSTILE_AIRSPACE') return;

    const callsigns = [
      'BANDIT-ALPHA', 'BANDIT-BRAVO', 'BANDIT-CHARLIE', 'BANDIT-DELTA',
      'BANDIT-ECHO', 'BANDIT-FOXTROT', 'BANDIT-GOLF', 'BANDIT-HOTEL',
      'BANDIT-INDIA', 'BANDIT-KILO', 'BANDIT-VIPER', 'BANDIT-RAVEN'
    ];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      // Spawn inside combat sector perimeter
      const dist = 800 + Math.random() * 1600;
      const x = center.x + Math.cos(angle) * dist;
      const z = center.z + Math.sin(angle) * dist;
      const y = center.y + (Math.random() - 0.5) * 600;

      const enemy = new EnemyAI({
        scene: this.scene,
        modelLoader: this.modelLoader,
        position: new THREE.Vector3(x, y, z),
        callsign: callsigns[i % callsigns.length],
        id: i + 1,
      });
      enemy.peaceful = this.hostilesDisabled;

      enemy.onKilled = (bandit, origin) => {
        if (origin === 'player') {
          this.kills++;
          document.getElementById('kills-value').textContent = this.kills;
          this.sound.playExplosion(bandit.position.distanceTo(this.player.position));
        }
        this.updateEnemyCountUI();
        // Continuous reinforcements: scramble replacement bandit after 4 seconds (only in hostile airspace)
        setTimeout(() => {
          if (!this.player.crashed && this.gameStarted && !this.hostilesDisabled && this.airspaceZone === 'HOSTILE_AIRSPACE') {
            this.spawnSingleEnemy(center);
          }
        }, 4000);
      };

      this.enemies.push(enemy);
    }
    this.updateEnemyCountUI();

    // Auto-select first target
    if (this.enemies.length > 0) {
      this.weaponManager.currentTarget = this.enemies[0];
    }
  }

  spawnSingleEnemy(center = new THREE.Vector3(0, 1600, -8200)) {
    if (this.hostilesDisabled || this.airspaceZone !== 'HOSTILE_AIRSPACE') return; // Do not spawn on home island!
    const callsigns = [
      'BANDIT-GHOST', 'BANDIT-PHANTOM', 'BANDIT-VIPER', 'BANDIT-COBRA',
      'BANDIT-FALCON', 'BANDIT-EAGLE', 'BANDIT-RAVEN', 'BANDIT-STRIKER'
    ];
    const angle = Math.random() * Math.PI * 2;
    const dist = 900 + Math.random() * 1500;
    const x = center.x + Math.cos(angle) * dist;
    const z = center.z + Math.sin(angle) * dist;
    const y = center.y + (Math.random() - 0.5) * 600;

    const enemy = new EnemyAI({
      scene: this.scene,
      modelLoader: this.modelLoader,
      position: new THREE.Vector3(x, y, z),
      callsign: callsigns[Math.floor(Math.random() * callsigns.length)],
      id: Math.floor(Math.random() * 1000) + 20,
    });
    enemy.peaceful = this.hostilesDisabled;

    enemy.onKilled = (bandit, origin) => {
      if (origin === 'player') {
        this.kills++;
        document.getElementById('kills-value').textContent = this.kills;
        this.sound.playExplosion(bandit.position.distanceTo(this.player.position));
      }
      this.updateEnemyCountUI();
      setTimeout(() => {
        if (!this.player.crashed && this.gameStarted && !this.hostilesDisabled && this.airspaceZone === 'HOSTILE_AIRSPACE') {
          this.spawnSingleEnemy(center);
        }
      }, 4000);
    };

    this.enemies.push(enemy);
    this.updateEnemyCountUI();

    if (!this.weaponManager.currentTarget || this.weaponManager.currentTarget.isDead) {
      this.weaponManager.currentTarget = enemy;
    }
  }

  updateEnemyCountUI() {
    const alive = this.enemies.filter(e => !e.isDead).length;
    const el = document.getElementById('enemies-remaining');
    if (el) el.textContent = alive;
    const radarContacts = document.getElementById('radar-contacts');
    if (radarContacts) radarContacts.textContent = `${alive} TGT`;
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      this.sound.ensureContext();
      this.keys[e.code] = true;

      // Single action keystrokes
      if (e.code === 'KeyF') {
        // Fire Missile
        if (this.weaponManager.fireMissile(
          this.player.position,
          this.player.forward,
          this.player.velocity,
          this.player.quaternion,
          this.weaponManager.currentTarget,
          'player',
          this.enemies
        )) {
          this.missilesFired++;
        }
      } else if (e.code === 'KeyC') {
        // Deploy Flares
        this.weaponManager.deployFlares(
          this.player.position,
          this.player.velocity,
          this.player.quaternion
        );
      } else if (e.code === 'KeyR') {
        // Cycle Target Lock
        this.cycleTarget();
      } else if (e.code === 'KeyV') {
        // Cycle Camera
        this.cycleCamera();
      } else if (e.code === 'KeyB') {
        // Toggle Airbrake
        this.player.physics.airbrake = this.player.physics.airbrake > 0 ? 0 : 1.0;
      } else if (e.code === 'KeyM') {
        // Toggle Audio
        const on = this.sound.toggle();
        const btn = document.getElementById('audio-btn');
        if (btn) btn.textContent = `AUDIO: ${on ? 'ON' : 'OFF'} [M]`;
      } else if (e.code === 'Escape') {
        this.toggleSettingsModal();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Prevent right-click context menu so Right Click can be used for smooth flight stick
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse Movement for virtual flight stick - ONLY active when holding Right Mouse Button
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseFlightEnabled || !this.isRightMouseDown) {
        this.mouse.x = 0;
        this.mouse.y = 0;
        return;
      }
      // Normalized coordinates: -1.0 to 1.0 with deadzone
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    window.addEventListener('mousedown', (e) => {
      this.sound.ensureContext();
      if (e.button === 0) {
        // Left Click = Fire Cannon
        this.isFiringGun = true;
      } else if (e.button === 2) {
        // Right Click = Hold to steer with virtual joystick
        this.isRightMouseDown = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isFiringGun = false;
      } else if (e.button === 2) {
        this.isRightMouseDown = false;
        this.mouse.x = 0;
        this.mouse.y = 0;
      }
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.x = 0;
      this.mouse.y = 0;
      this.isRightMouseDown = false;
      this.isFiringGun = false;
    });
  }

  setupUI() {
    // Camera Cycle Button
    document.getElementById('cam-btn').addEventListener('click', () => this.cycleCamera());

    // Audio Button
    document.getElementById('audio-btn').addEventListener('click', () => {
      this.sound.ensureContext();
      const on = this.sound.toggle();
      document.getElementById('audio-btn').textContent = `AUDIO: ${on ? 'ON' : 'OFF'} [M]`;
    });

    // Settings Modal
    document.getElementById('settings-btn').addEventListener('click', () => this.toggleSettingsModal());
    document.getElementById('close-settings-btn').addEventListener('click', () => this.toggleSettingsModal());

    // Scale Sliders (Allows user to calibrate FBX model scales live!)
    const jetSlider = document.getElementById('jet-scale-slider');
    const jetVal = document.getElementById('jet-scale-val');
    jetSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      jetVal.textContent = `${val.toFixed(1)}x`;
      this.modelLoader.userJetScale = val;
      if (this.player && this.player.mesh) {
        this.player.mesh.scale.setScalar(val);
      }
      for (const en of this.enemies) {
        if (en.mesh) en.mesh.scale.setScalar(val);
      }
    });

    const mslSlider = document.getElementById('msl-scale-slider');
    const mslVal = document.getElementById('msl-scale-val');
    mslSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      mslVal.textContent = `${val.toFixed(1)}x`;
      this.modelLoader.userMissileScale = val;
    });

    // Pitch Invert Toggle
    const invertToggle = document.getElementById('invert-pitch-toggle');
    invertToggle.addEventListener('change', (e) => {
      this.invertPitch = e.target.checked;
    });

    // Mouse Flight Toggle
    const mouseToggle = document.getElementById('mouse-flight-toggle');
    mouseToggle.addEventListener('change', (e) => {
      this.mouseFlightEnabled = e.target.checked;
    });

    // Toggle Hostiles / Peaceful Flight Sim Mode
    const toggleHostilesBtn = document.getElementById('toggle-hostiles-btn');
    const hostilesDesc = document.getElementById('hostiles-mode-desc');
    if (toggleHostilesBtn) {
      toggleHostilesBtn.addEventListener('click', () => {
        this.hostilesDisabled = !this.hostilesDisabled;
        for (const en of this.enemies) {
          en.peaceful = this.hostilesDisabled;
        }
        if (this.hostilesDisabled) {
          toggleHostilesBtn.textContent = 'ENABLE HOSTILES (COMBAT)';
          toggleHostilesBtn.style.background = 'rgba(255, 170, 0, 0.2)';
          toggleHostilesBtn.style.borderColor = '#ffaa00';
          if (hostilesDesc) hostilesDesc.textContent = 'Peaceful mode active: Enemies will cruise peacefully without attacking.';
          const missionStatus = document.getElementById('mission-status');
          if (missionStatus) missionStatus.textContent = 'PEACEFUL CRUISE // FREE SKIES';
        } else {
          toggleHostilesBtn.textContent = 'DISABLE HOSTILES (PEACEFUL)';
          toggleHostilesBtn.style.background = 'rgba(0, 229, 255, 0.2)';
          toggleHostilesBtn.style.borderColor = '#00e5ff';
          if (hostilesDesc) hostilesDesc.textContent = 'Combat mode active: Hostiles will engage in dogfights.';
          const missionStatus = document.getElementById('mission-status');
          if (missionStatus) missionStatus.textContent = 'AIR PATROL // ENGAGE HOSTILES';
        }
      });
    }

    // Instakill All Hostiles Button
    const instakillBtn = document.getElementById('instakill-btn');
    if (instakillBtn) {
      instakillBtn.addEventListener('click', () => {
        let killedCount = 0;
        for (const en of this.enemies) {
          if (en && !en.isDead) {
            en.takeDamage(999, 'player');
            killedCount++;
          }
        }
        this.sound.playExplosion(300);
        this.updateEnemyCountUI();
      });
    }

    // Clear Airspace Button (Solo flight experience)
    const clearEnemiesBtn = document.getElementById('clear-enemies-btn');
    if (clearEnemiesBtn) {
      clearEnemiesBtn.addEventListener('click', () => {
        for (const en of this.enemies) {
          if (en.mesh) this.scene.remove(en.mesh);
        }
        this.enemies = [];
        this.updateEnemyCountUI();
        const missionStatus = document.getElementById('mission-status');
        if (missionStatus) missionStatus.textContent = 'SOLO FLIGHT // AIRSPACE SECURED';
      });
    }

    // Baked Raytracing & Time-of-Day Controls
    const timeSlider = document.getElementById('time-slider');
    const timeSliderVal = document.getElementById('time-slider-val');
    if (timeSlider) {
      timeSlider.addEventListener('input', (e) => {
        const h = parseFloat(e.target.value);
        if (this.world && this.world.bakedLighting) {
          this.world.bakedLighting.setTime(h);
          const tInfo = this.world.bakedLighting.getFormattedTime();
          if (timeSliderVal) timeSliderVal.textContent = `${tInfo.clock} (${tInfo.phase})`;
        }
      });
    }

    const setTimePreset = (hour, activeBtnId) => {
      if (this.world && this.world.bakedLighting) {
        this.world.bakedLighting.setTime(hour);
        ['time-btn-dawn', 'time-btn-noon', 'time-btn-dusk', 'time-btn-night'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.classList.toggle('active', id === activeBtnId);
        });
      }
    };

    const dawnBtn = document.getElementById('time-btn-dawn');
    if (dawnBtn) dawnBtn.addEventListener('click', () => setTimePreset(6.0, 'time-btn-dawn'));
    const noonBtn = document.getElementById('time-btn-noon');
    if (noonBtn) noonBtn.addEventListener('click', () => setTimePreset(12.0, 'time-btn-noon'));
    const duskBtn = document.getElementById('time-btn-dusk');
    if (duskBtn) duskBtn.addEventListener('click', () => setTimePreset(18.0, 'time-btn-dusk'));
    const nightBtn = document.getElementById('time-btn-night');
    if (nightBtn) nightBtn.addEventListener('click', () => setTimePreset(24.0, 'time-btn-night'));

    const setSpeedPreset = (speed, paused, activeBtnId) => {
      if (this.world && this.world.bakedLighting) {
        this.world.bakedLighting.isPaused = paused;
        if (!paused) this.world.bakedLighting.timeScale = speed;
        ['time-spd-pause', 'time-spd-1', 'time-spd-60', 'time-spd-180'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.classList.toggle('active', id === activeBtnId);
        });
      }
    };

    const spdPause = document.getElementById('time-spd-pause');
    if (spdPause) spdPause.addEventListener('click', () => setSpeedPreset(0, true, 'time-spd-pause'));
    const spd1 = document.getElementById('time-spd-1');
    if (spd1) spd1.addEventListener('click', () => setSpeedPreset(1.0, false, 'time-spd-1'));
    const spd60 = document.getElementById('time-spd-60');
    if (spd60) spd60.addEventListener('click', () => setSpeedPreset(60.0, false, 'time-spd-60'));
    const spd180 = document.getElementById('time-spd-180');
    if (spd180) spd180.addEventListener('click', () => setSpeedPreset(180.0, false, 'time-spd-180'));

    // Spawn Enemy Button
    document.getElementById('spawn-enemy-btn').addEventListener('click', () => {
      this.spawnEnemies(2);
    });

    // Reset Flight Button
    document.getElementById('reset-flight-btn').addEventListener('click', () => {
      this.resetGame();
      this.toggleSettingsModal(false);
    });

    // Aircraft Selection Cards
    const planeCards = document.querySelectorAll('.plane-card');
    planeCards.forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-plane');
        this.selectPlane(type);
      });
    });

    // Launch Flight Button (Start game only after player picks plane and clicks launch)
    const launchBtn = document.getElementById('launch-flight-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        this.launchFlight();
      });
    }

    // Return to Hangar / Change Aircraft Buttons
    const hangarBtn = document.getElementById('hangar-btn');
    if (hangarBtn) {
      hangarBtn.addEventListener('click', () => this.returnToHangar());
    }
    const goHangarBtn = document.getElementById('gameover-hangar-btn');
    if (goHangarBtn) {
      goHangarBtn.addEventListener('click', () => this.returnToHangar());
    }

    // Respawn Button
    document.getElementById('respawn-btn').addEventListener('click', () => {
      this.resetGame();
      document.getElementById('game-over-modal').classList.add('hidden');
    });
  }

  selectPlane(type) {
    if (!type) return;
    this.selectedPlaneType = type;
    this.modelLoader.activePlaneType = type;

    // Update UI cards
    document.querySelectorAll('.plane-card').forEach(card => {
      const isSelected = card.getAttribute('data-plane') === type;
      card.classList.toggle('active', isSelected);
      const statusEl = card.querySelector('.card-badge-status');
      if (statusEl) {
        statusEl.textContent = isSelected ? 'READY FOR FLIGHT' : 'CLICK TO SELECT';
      }
    });

    // Update 3D preview model in hangar
    if (this.player) {
      this.player.setAircraftModel(type);
    }

    // Update HUD callsign
    const callsignEl = document.querySelector('.callsign');
    if (callsignEl) {
      if (type === 'f16') callsignEl.textContent = 'VIPER-1 [F-16C]';
      else if (type === 'typhoon') callsignEl.textContent = 'TYPHOON-1 [EF-2000]';
      else if (type === 'rapidshadow') callsignEl.textContent = 'SHADOW-1 [X-77]';
    }
  }

  launchFlight() {
    this.sound.ensureContext();
    this.gameStarted = true;

    // Hide Menu Screen
    const menuEl = document.getElementById('menu-screen');
    if (menuEl) menuEl.classList.add('hidden');

    // Enable Combat UI
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.classList.remove('in-menu');

    // Spawn player on Starting Island Runway 36 ready for takeoff roll!
    // Heading North (-Z) straight down runway centerline towards departure gate
    this.player.reset(new THREE.Vector3(0, 39.5, 1250), 0);
    this.player.physics.throttle = 0.0; // Stationary on runway until Shift is pressed!
    this.player.physics.boundaryCenter = new THREE.Vector3(0, 0, 0);
    this.player.physics.boundaryRadius = 3800;
    this.player.setAircraftModel(this.selectedPlaneType);

    // Starting Island has ZERO enemies!
    for (const en of this.enemies) {
      if (en.mesh) this.scene.remove(en.mesh);
    }
    this.enemies = [];
    this.airspaceZone = 'HOME_BASE';

    this.kills = 0;
    this.missilesFired = 0;
    document.getElementById('kills-value').textContent = '0';
    this.startTime = performance.now();

    const missionStatus = document.getElementById('mission-status');
    if (missionStatus) {
      missionStatus.textContent = 'RUNWAY 36 // CLEARED FOR TAKEOFF - ENTER PORTAL';
    }
  }

  handleWarpTransition(warpEvent) {
    const targetAirspace = warpEvent.targetAirspace;
    console.log(`[Main] Executing Warp Jump to ${targetAirspace}`);

    // 1. Hyperspace Visual Screen Flash & Camera Zoom Punch
    const warpOverlay = document.getElementById('warp-overlay');
    if (warpOverlay) {
      warpOverlay.classList.add('active');
      setTimeout(() => warpOverlay.classList.remove('active'), 380);
    }

    const initialFov = this.camera.fov;
    this.camera.fov = 118;
    this.camera.updateProjectionMatrix();
    setTimeout(() => {
      this.camera.fov = initialFov;
      this.camera.updateProjectionMatrix();
    }, 450);

    // 2. Teleport Player Aircraft
    const dest = warpEvent.targetPosition;
    this.player.position.copy(dest);
    this.player.physics.position.copy(dest);

    // 3. Update Airspace State & Portal Readiness
    this.airspaceZone = targetAirspace;
    if (this.world && this.world.portalSystem) {
      this.world.portalSystem.activeWarp = false;
    }

    if (targetAirspace === 'HOSTILE_AIRSPACE') {
      // Set combat boundary centered on Hostile Island 2
      this.player.physics.boundaryCenter = new THREE.Vector3(0, 0, -8200);
      this.player.physics.boundaryRadius = 3800;

      // Fly South over Hostile Island 2 towards the ground-level portal
      this.player.physics.velocity.set(0, 0, 220);
      const southQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      this.player.physics.quaternion.copy(southQuat);
      this.player.mesh.quaternion.copy(southQuat);

      // Spawn hostile bandit squadron around Hostile Island 2
      for (const en of this.enemies) {
        if (en.mesh) this.scene.remove(en.mesh);
      }
      this.enemies = [];
      this.spawnEnemies(8, new THREE.Vector3(0, 1600, -8200));

      if (this.sound && this.sound.playWarningBeep) {
        this.sound.playWarningBeep('missile');
      }

      const missionStatus = document.getElementById('mission-status');
      if (missionStatus) {
        missionStatus.textContent = '▲ COMBAT SECTOR // HOSTILE ISLAND ENGAGED ▲';
      }
    } else {
      // Returned to Home Airbase
      this.player.physics.boundaryCenter = new THREE.Vector3(0, 0, 0);
      this.player.physics.boundaryRadius = 3800;

      // Fly North aligned with Home Base Runway 36 approach
      this.player.physics.velocity.set(0, 0, -200);
      this.player.physics.quaternion.identity();
      this.player.mesh.quaternion.identity();

      // Despawn all hostile bandits
      for (const en of this.enemies) {
        if (en.mesh) this.scene.remove(en.mesh);
      }
      this.enemies = [];
      this.weaponManager.currentTarget = null;

      // Field Repair & Replenish Ordnance
      this.player.health = 100;
      this.player.isSmoking = false;
      this.weaponManager.gunAmmo = this.weaponManager.gunMaxAmmo;
      this.weaponManager.missileAmmo = Infinity;
      this.weaponManager.flareAmmo = this.weaponManager.flareMaxAmmo;

      const missionStatus = document.getElementById('mission-status');
      if (missionStatus) {
        missionStatus.textContent = 'HOME AIRBASE // SECURE - REPAIRED & REARMED';
      }
    }
  }

  returnToHangar() {
    this.gameStarted = false;

    // Show Menu Screen
    const menuEl = document.getElementById('menu-screen');
    if (menuEl) menuEl.classList.remove('hidden');

    // Hide modals
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('game-over-modal').classList.add('hidden');

    // Hide combat UI
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.classList.add('in-menu');

    // Park aircraft on runway for 3D showcase
    this.player.reset(new THREE.Vector3(0, 39, 0), 0);
    this.player.setAircraftModel(this.selectedPlaneType);
  }

  cycleCamera() {
    if (this.cameraMode === 'CHASE') {
      this.cameraMode = 'COCKPIT';
    } else if (this.cameraMode === 'COCKPIT') {
      this.cameraMode = 'FLYBY';
      this.flybyPosition.copy(this.player.position).add(new THREE.Vector3(60, 20, -180));
    } else {
      this.cameraMode = 'CHASE';
    }
    document.getElementById('cam-btn').textContent = `CAM: ${this.cameraMode} [V]`;
  }

  cycleTarget() {
    const liveEnemies = this.enemies.filter(e => !e.isDead);
    if (liveEnemies.length === 0) {
      this.weaponManager.currentTarget = null;
      return;
    }
    const idx = liveEnemies.indexOf(this.weaponManager.currentTarget);
    const nextIdx = (idx + 1) % liveEnemies.length;
    this.weaponManager.currentTarget = liveEnemies[nextIdx];
  }

  toggleSettingsModal(forceState) {
    const modal = document.getElementById('settings-modal');
    if (forceState !== undefined) {
      modal.classList.toggle('hidden', !forceState);
    } else {
      modal.classList.toggle('hidden');
    }
  }

  resetGame() {
    this.player.reset(new THREE.Vector3(0, 1600, 0), 230);
    this.weaponManager.gunAmmo = this.weaponManager.gunMaxAmmo;
    this.weaponManager.missileAmmo = this.weaponManager.missileMaxAmmo;
    this.weaponManager.flareAmmo = this.weaponManager.flareMaxAmmo;
    this.startTime = performance.now();
  }

  processPlayerControls(dt) {
    if (this.player.crashed) return;
    const phys = this.player.physics;

    // 1. Pitch Control (W and S SWAPPED):
    // W = Pitch UP (pull stick back)
    // S = Pitch DOWN (push stick forward)
    let targetElevator = 0;
    if (this.keys['KeyW']) targetElevator = this.invertPitch ? -1.0 : 1.0;
    if (this.keys['KeyS']) targetElevator = this.invertPitch ? 1.0 : -1.0;

    // 2. Roll and Yaw (Inverted Q/E and A/D):
    // Q / E = Bank Roll (Inverted)
    let targetAileron = 0;
    if (this.keys['KeyQ']) targetAileron = 1.0;
    if (this.keys['KeyE']) targetAileron = -1.0;

    // A / D = Rudder Yaw (Inverted)
    let targetRudder = 0;
    if (this.keys['KeyA']) targetRudder = 1.0;
    if (this.keys['KeyD']) targetRudder = -1.0;

    // Virtual Mouse Flight Stick Assist
    if (this.mouseFlightEnabled && Math.hypot(this.mouse.x, this.mouse.y) > 0.05) {
      const deadzone = 0.08;
      if (Math.abs(this.mouse.y) > deadzone) {
        const my = (Math.abs(this.mouse.y) - deadzone) * Math.sign(this.mouse.y);
        const pitchCmd = my * (this.invertPitch ? 1.4 : -1.4);
        targetElevator = Math.max(-1.0, Math.min(1.0, targetElevator + pitchCmd));
      }
      if (Math.abs(this.mouse.x) > deadzone) {
        const mx = (Math.abs(this.mouse.x) - deadzone) * Math.sign(this.mouse.x);
        targetAileron = Math.max(-1.0, Math.min(1.0, targetAileron + mx * 1.5));
      }
    }

    // Apply control surfaces
    phys.elevator = targetElevator;
    phys.aileron = targetAileron;
    phys.rudder = targetRudder;

    // 4. Throttle, Boost & Airbrake Control
    const isShift = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const isCtrl = !!(this.keys['ControlLeft'] || this.keys['ControlRight']);

    // Check if aircraft is on runway / ground
    const isOnGround = phys.position.y <= phys.groundElevation + 2.5;

    if (isShift) {
      // PRESSING SHIFT: BOOST RESTARTS INSTANTLY, AIRBRAKE RETRACTS
      phys.airbrake = 0.0;
      phys.throttle = 1.0;
      phys.isBoosting = true;

      // Easy Takeoff Roll: starts slowly pushing the plane forward, speed increases exponentially
      if (isOnGround) {
        this.shiftHoldDuration = (this.shiftHoldDuration || 0) + dt;
        const t = this.shiftHoldDuration;
        const expSpeed = Math.min(220, 18 * Math.pow(1.85, Math.min(t * 1.1, 4.2)));
        const forwardSpeed = -this.player.physics._localVel.z;
        if (forwardSpeed < expSpeed) {
          this.player.physics.velocity.addScaledVector(
            this.player.forward,
            (expSpeed - Math.max(0, forwardSpeed)) * Math.min(1.0, 4.0 * dt)
          );
        }
      }
    } else {
      // RELEASING SHIFT: STOPS BOOST & ENGAGES ACTIVE AIRBRAKE
      this.shiftHoldDuration = 0;
      phys.throttle = 0.0;
      phys.isBoosting = false;

      // Airbrake must be active when not boosting!
      phys.airbrake = 1.0;

      // On ground, wheel brakes and airbrake bring aircraft to smooth full stop
      if (isOnGround) {
        phys.velocity.multiplyScalar(Math.max(0, 1.0 - 4.5 * dt));
      }
    }

    // 5. Weapon Continuous Fire
    // Autocannon continuous fire
    if (this.keys['Space'] || this.isFiringGun) {
      this.weaponManager.fireGun(
        this.player.position,
        this.player.forward,
        this.player.velocity,
        'player'
      );
    }
    // Missile continuous salvo when holding F
    if (this.keys['KeyF']) {
      if (this.weaponManager.fireMissile(
        this.player.position,
        this.player.forward,
        this.player.velocity,
        this.player.quaternion,
        this.weaponManager.currentTarget,
        'player',
        this.enemies
      )) {
        this.missilesFired++;
      }
    }

    // 6. Audio Engine Updates
    this.sound.updateEngine(phys.throttle, phys.airspeed, phys.isAfterburner);
  }

  updateCamera() {
    const pPos = this.player.position;
    const pForward = this.player.forward;
    const pUp = this.player.up;
    const pQuat = this.player.quaternion;

    if (this.cameraMode === 'COCKPIT') {
      // First person view inside cockpit canopy looking along aircraft nose
      const mount = this.player.cockpitMount.clone().applyQuaternion(pQuat);
      this.camera.position.copy(pPos).add(mount);
      this.camera.quaternion.copy(pQuat);
      if (this.camera.near !== 0.10) {
        this.camera.near = 0.10;
      }
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
    } else if (this.cameraMode === 'CHASE') {
      if (this.camera.near !== 0.5) {
        this.camera.near = 0.5;
      }
      // Third person chase cam smoothly trailing behind and slightly above
      const chaseOffset = this.player.chaseMount.clone().applyQuaternion(pQuat);
      const targetCamPos = pPos.clone().add(chaseOffset);

      // Smooth camera interpolation
      this.camera.position.lerp(targetCamPos, 0.16);
      this.camera.quaternion.slerp(pQuat, 0.16);

      // Dynamic FOV zoom based on Mach speed
      const targetFOV = 60 + Math.min(22, (this.player.physics.mach - 0.6) * 35);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 0.05);
      this.camera.updateProjectionMatrix();
    } else if (this.cameraMode === 'FLYBY') {
      if (this.camera.near !== 0.5) {
        this.camera.near = 0.5;
      }
      // Stationary cinematic flyby
      this.camera.position.copy(this.flybyPosition);
      this.camera.lookAt(pPos);
      this.camera.fov = 45;
      this.camera.updateProjectionMatrix();

      // Reposition flyby if jet gets too far (> 1200m)
      if (this.camera.position.distanceTo(pPos) > 1200) {
        this.flybyPosition.copy(pPos).add(pForward.clone().multiplyScalar(400)).add(new THREE.Vector3(80, 25, 0));
      }
    }
  }

  updateUI() {
    // Weapon Ammo Bars
    const gunAmmo = this.weaponManager.gunAmmo;
    const gunPercent = (gunAmmo / this.weaponManager.gunMaxAmmo) * 100;
    document.getElementById('gun-ammo').textContent = gunAmmo;
    document.getElementById('gun-ammo-bar').style.width = `${gunPercent}%`;

    // Infinite Missiles Display
    document.getElementById('msl-ammo').textContent = '∞';
    document.getElementById('msl-ammo-bar').style.width = '100%';

    const flrAmmo = this.weaponManager.flareAmmo;
    const flrPercent = (flrAmmo / this.weaponManager.flareMaxAmmo) * 100;
    document.getElementById('flr-ammo').textContent = flrAmmo;
    document.getElementById('flr-ammo-bar').style.width = `${flrPercent}%`;

    // Aircraft Hull Integrity
    const hull = Math.round(this.player.health);
    document.getElementById('hull-value').textContent = hull;
    const hullBar = document.getElementById('hull-bar');
    hullBar.style.width = `${hull}%`;
    hullBar.style.background = hull > 50 ? '#00ffaa' : hull > 25 ? '#ffcc00' : '#ff3355';

    // Master Clock & Baked Raytracing HUD Indicator
    if (this.world && this.world.bakedLighting) {
      const tInfo = this.world.bakedLighting.getFormattedTime();
      const clockEl = document.getElementById('time-clock');
      if (clockEl) clockEl.textContent = tInfo.clock;
      const phaseEl = document.getElementById('time-phase');
      if (phaseEl) phaseEl.textContent = tInfo.phase;

      const timeSliderVal = document.getElementById('time-slider-val');
      const timeSlider = document.getElementById('time-slider');
      if (timeSliderVal && document.activeElement !== timeSlider) {
        timeSliderVal.textContent = `${tInfo.clock} (${tInfo.phase})`;
        if (timeSlider) timeSlider.value = tInfo.hours.toFixed(1);
      }
    }

    // G-Force Blackout/Redout Vignette
    const g = this.player.physics.gForce;
    let vignetteOpacity = 0;
    let vignetteColor = 'radial-gradient(circle, transparent 40%, black 100%)';

    if (g > 6.0) {
      // Blackout
      vignetteOpacity = Math.min(0.92, (g - 6.0) / 3.0);
      vignetteColor = 'radial-gradient(circle, transparent 30%, black 100%)';
    } else if (g < -1.5) {
      // Redout
      vignetteOpacity = Math.min(0.85, (-g - 1.5) / 2.0);
      vignetteColor = 'radial-gradient(circle, transparent 35%, rgba(255, 0, 30, 0.9) 100%)';
    }

    if (this.gforceOverlay) {
      this.gforceOverlay.style.background = vignetteColor;
      this.gforceOverlay.style.opacity = vignetteOpacity;
    }

    // Tactical Bandit Threat Check (Enemy on your six)
    const pPos = this.player.position;
    const pForward = this.player.forward;
    let banditOnSix = false;

    for (const enemy of this.enemies) {
      if (!enemy || enemy.isDead) continue;
      const toEnemy = enemy.position.clone().sub(pPos);
      const dist = toEnemy.length();
      if (dist < 950) {
        const isBehind = pForward.dot(toEnemy.clone().normalize()) < -0.25;
        const toPlayer = pPos.clone().sub(enemy.position).normalize();
        const enemyFacingUs = enemy.forward.dot(toPlayer) > 0.85;
        if (isBehind && enemyFacingUs) {
          banditOnSix = true;
          break;
        }
      }
    }
    this.banditOnSix = banditOnSix;

    const warnBanner = document.getElementById('warning-banner');
    const warnText = document.getElementById('warning-text');
    if (banditOnSix) {
      warnBanner.classList.remove('hidden');
      if (warnText) warnText.textContent = 'BANDIT ON YOUR SIX';
      this.sound.playWarningBeep('missile');
    } else {
      warnBanner.classList.add('hidden');
    }

    // Check Player Death / Crash
    if (this.player.crashed) {
      const gameOverModal = document.getElementById('game-over-modal');
      if (gameOverModal.classList.contains('hidden')) {
        gameOverModal.classList.remove('hidden');
        document.getElementById('final-kills').textContent = this.kills;
        document.getElementById('final-missiles').textContent = this.missilesFired;
        const elapsedSec = Math.floor((performance.now() - this.startTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        document.getElementById('final-time').textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.max(0.001, Math.min(this.clock.getDelta(), 0.033));

    try {
      // Menu Hangar Showcase: cinematic orbit around chosen jet parked on runway
      if (!this.gameStarted) {
        this.menuOrbitAngle += 0.006;
        const orbitRadius = 22.0;
        const planeY = 39.5;
        this.camera.position.set(
          Math.cos(this.menuOrbitAngle) * orbitRadius,
          planeY + 6.2 + Math.sin(this.menuOrbitAngle * 0.5) * 1.0,
          Math.sin(this.menuOrbitAngle) * orbitRadius
        );
        this.camera.lookAt(0, planeY + 2.8, 0);

        if (this.player && this.player.mesh) {
          this.player.physics.position.set(0, planeY, 0);
          this.player.physics.velocity.set(0, 0, 0);
          this.player.mesh.position.set(0, planeY, 0);
          this.player.mesh.quaternion.identity();
        }

        this.world.update(new THREE.Vector3(0, 39, 0), dt, 'HOME_BASE');
        this.renderer.render(this.scene, this.camera);
        return;
      }

      // 1. Process Flight Inputs
      this.processPlayerControls(dt);

      // 2. Step Player Aircraft
      this.player.update(dt);

      // 3. Step Enemies AI
      for (const enemy of this.enemies) {
        enemy.update(dt, this.player, this.weaponManager);
      }

      // 4. Update Weapon Tracking & Ballistics
      this.weaponManager.updateTargetLock(
        this.player.position,
        this.player.forward,
        this.weaponManager.currentTarget,
        this.enemies
      );
      this.weaponManager.update(dt, this.enemies, this.player);

      // 5. Update Environment & Quantum Warp Portals
      this.world.update(this.player.position, dt, this.airspaceZone);

      // 6. Update Camera
      this.updateCamera();

      // 7. Render 3D Scene
      this.renderer.render(this.scene, this.camera);

      // 8. Render Vector HUD & Radar with Portal Waypoint Navigation
      const activePortal = this.world.portalSystem ? this.world.portalSystem.getActivePortal(this.airspaceZone) : null;
      this.hud.render(this.player, this.enemies, this.weaponManager, this.banditOnSix, activePortal, this.airspaceZone);

      // 9. Update UI telemetry & FPS Counter
      this.updateUI();

      this.fpsFrames++;
      const now = performance.now();
      if (now - this.lastFpsTime >= 250) {
        const fps = Math.round((this.fpsFrames * 1000) / (now - this.lastFpsTime));
        const fpsEl = document.getElementById('fps-value');
        if (fpsEl) {
          fpsEl.textContent = fps;
          const badge = document.getElementById('fps-badge');
          if (badge) {
            badge.style.borderColor = fps >= 50 ? 'rgba(0, 255, 170, 0.4)' : fps >= 30 ? 'rgba(255, 204, 0, 0.5)' : 'rgba(255, 51, 85, 0.5)';
          }
        }
        this.fpsFrames = 0;
        this.lastFpsTime = now;
      }
    } catch (err) {
      console.warn('[FlightSim Frame Handled Error]:', err);
    }
  }
}

// Start Simulator when DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.flightSim = new FlightSimulatorApp();
});
