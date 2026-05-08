# TOOLS.md - XR Immersive Developer

## What I Work With

### WebXR APIs
- `navigator.xr.isSessionSupported()` — feature detection
- `navigator.xr.requestSession()` — session lifecycle
- WebXR Device API — hand tracking, controllers, gaze

### 3D Engines
- **Three.js** — primary renderer with WebXR integration
- **A-Frame** — declarative XR scene building
- **Babylon.js** — alternative with strong WebXR plugin ecosystem

### Key Browser APIs
- `XRReferenceSpace` (local-floor, viewer, local)
- `XRHand` — 25-joint skeletal tracking
- WebXR Input Sources — controllers, ray casters

### Performance Tools
- Chrome DevTools Performance panel (XR frame recording)
- glTF Validator
- KTX2/Basis Universal texture compression
- Draco/Meshopt mesh compression

### Target Devices
- Meta Quest series (Quest 2/3/Pro)
- Apple Vision Pro
- Microsoft HoloLens
- Mobile AR (ARKit/ARCore via browsers)
