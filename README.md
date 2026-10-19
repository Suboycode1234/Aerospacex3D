# AerospaceX 3D ✈️⚡

[![Three.js](https://img.shields.io/badge/Three.js-r174-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebGL](https://img.shields.io/badge/WebGL-2.0-990000?style=for-the-badge&logo=webgl&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

An ultra-responsive, browser-based **3D Combat Flight Simulator** built from the ground up with **Three.js**, **Vite**, and **Web Audio API**. Features realistic aerodynamic physics, authentic combat cockpits, guided missile dogfighting, volumetric stargate portals, and a standalone single-file distribution that runs 100% offline.

---

## 🌟 Key Features

- **Realistic Flight Dynamics**:
  - Full 6-DOF aerodynamic modeling with lift, drag polar curves, induced drag, and angle-of-attack stall dynamics.
  - Active dorsal airbrake system with automatic drag increase, deceleration, and runway wheel braking.
  - Exponential runway takeoff roll and in-flight super-boost afterburner system.
  - High-G vapor trails and dynamic wingtip vortices.

- **Playable Fighter Aircraft**:
  - **F-16 Fighting Falcon**: High-agility multirole jet fighter with single-engine afterburner and realistic bubble canopy.
  - **Eurofighter Typhoon**: Twin-engine delta-canard air superiority fighter.
  - **Rapid Shadow [X-77]**: Next-generation military stealth fighter with radar-absorbent carbon finish and canted twin vertical stabilizers.

- **Combat & Weapon Systems**:
  - **20mm Vulcan Rotary Cannon**: Ballistic tracer mechanics, high-velocity projectile streams, and dynamic lead-target computation.
  - **AIM-9 Sidewinder Guided Missiles**: Proportional navigation (PN) guidance, thermal target locking, realistic audio lock tones, and proximity detonation.
  - **Infinite Combat Ordnance**: Sustained dogfight engagements against aggressive bandit AI squadrons.

- **Dual-Island War Theater**:
  - **Home Island Base**: Protected staging zone featuring naval runway asphalt, taxiways, hangars, and a forward stargate departure arch.
  - **Hostile Island Airspace**: High-threat war zone populated with enemy fighter AI patrols and dogfight encounters.
  - **Volumetric Warp Portals**: Stargate ring anomalies enabling seamless, zero-load-screen warp transitions between island airspaces.

- **Authentic Avionics & Camera Systems**:
  - **First-Person In-Cockpit View**: Positioned inside the canopy with true glass reflections and pilot sightlines.
  - **Third-Person Tactical Chase Cam**: High-visibility combat tracking with smooth orientation damping.
  - **Fly-By Cinematic View**: Dynamic spectator perspective.
  - **Fighter Jet HUD**: Projected collimated pitch ladder, artificial horizon, digital airspeed & altitude tapes, heading compass, and lock-on target reticles.

- **Zero-Dependency Standalone Bundle**:
  - Packs the complete game, Three.js engine, procedural terrain, sounds, and base64-encoded 3D GLB/FBX models into a single `flight-sim-3d.html` file that opens directly in any browser with zero installation.

---

## 🎮 Flight Controls

| Control | Action |
| :--- | :--- |
| <kbd>Shift</kbd> (Hold) | **Throttle Up / Super-Boost** (Exponential takeoff on ground / Mach boost in air) |
| <kbd>Shift</kbd> (Release) | **Active Airbrake** (Closes boost, raises airbrake flap, sheds speed) |
| <kbd>W</kbd> | **Pitch Down** (Nose Down / Push Stick) |
| <kbd>S</kbd> | **Pitch Up** (Nose Up / Pull Stick) |
| <kbd>A</kbd> | **Bank Left** (Left Aileron) |
| <kbd>D</kbd> | **Bank Right** (Right Aileron) |
| <kbd>Q</kbd> | **Rudder Left** (Yaw Left) |
| <kbd>E</kbd> | **Rudder Right** (Yaw Right) |
| <kbd>Space</kbd> | **Fire 20mm Rotary Cannon** |
| <kbd>F</kbd> | **Launch AIM-9 Sidewinder Missile** |
| <kbd>C</kbd> | **Cycle Camera** (Cockpit Inside Canopy ➔ Chase Cam ➔ Fly-by) |
| <kbd>H</kbd> | **Toggle Tactical HUD** |
| <kbd>R</kbd> | **Respawn / Reset Aircraft** |

---

## 🛠️ Technology Stack

- **Core Engine**: [Three.js](https://threejs.org/) (r174) with WebGLRenderer & WebGPU-ready architecture
- **Build Tool**: [Vite](https://vitejs.dev/) & [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)
- **Audio**: Web Audio API Procedural Jet Engine & Afterburner Synthesizer (Zero external audio files)
- **3D Formats**: GLTF/GLB (`GLTFLoader`) and FBX (`FBXLoader`)

---

## 🚀 Getting Started

### Option 1: Instant Play (Standalone HTML)
Simply download or double-click [`flight-sim-3d.html`](./flight-sim-3d.html) in your browser. No server, Node.js, or internet connection required.

### Option 2: Run Locally with Vite

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Suboycode1234/Aerospacex3D.git
   cd Aerospacex3D
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. **Build the Standalone Offline HTML**:
   ```bash
   node scripts/pack-standalone.js
   ```
   This compiles all code and encodes all 3D aircraft and missile models into `flight-sim-3d.html`.

---

## 📂 Repository Structure

```
Aerospacex3D/
├── flight-sim-3d.html       # Self-contained standalone single-file distribution (~96 MB)
├── index.html               # Main development entry point
├── style.css                # Military HUD and UI styling
├── package.json             # Project dependencies and scripts
├── vite.config.js           # Vite build and single-file bundle configuration
├── public/                  # Static models and texture assets
│   └── models/
│       ├── jets/            # F-16 and Eurofighter Typhoon GLB models
│       ├── fighter-jet/     # Rapid Shadow stealth fighter FBX & textures
│       └── missile/         # AIM-9 Sidewinder rocket FBX & PBR textures
├── scripts/
│   └── pack-standalone.js   # Automated base64 model bundler
└── src/
    ├── main.js              # Game loop, input handling, and scene orchestration
    ├── audio/               # Procedural audio engine & sound synthesizer
    ├── entities/            # Airplane, Enemy AI, and 3D Model Loaders
    ├── environment/         # Dual-island terrain, skybox, and volumetric portals
    ├── physics/             # 6-DOF aerodynamic flight simulation engine
    ├── ui/                  # Collimated fighter jet HUD & instrumentation
    └── weapons/             # Rotary cannon ballistics and guided missiles
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
