// ========== render3d.js — Three.js 3D World Engine ==========

const ThreeEngine = {
    scene: null,
    camera: null,
    renderer: null,
    container: null,
    entities: new Map(),
    ground: null,
    lights: {},
    debris: [],
    embers: null,
    ready: false,
    _glowTextureCache: {},
    _baseFov: 50,

    init() {
        if (typeof THREE === 'undefined') {
            console.warn('Three.js not loaded, 3D disabled');
            this.ready = false;
            return;
        }

        this.container = document.getElementById('three-container');
        if (!this.container) return;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x030303);
        this.scene.fog = new THREE.FogExp2(0x050304, 0.007);

        // Camera — isometric-style top-down
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(this._baseFov, aspect, 0.1, 500);
        this.camera.position.set(0, 120, 80);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.container.appendChild(this.renderer.domElement);

        this._buildLighting();
        this._buildGround();
        this._buildDebris();
        this._buildAtmosphere();

        window.addEventListener('resize', () => this.onResize());
        this.ready = true;
        this._animate();
    },

    _buildLighting() {
        // Sky/ground gradient ambient — richer than a flat ambient light
        this.lights.hemi = new THREE.HemisphereLight(0x445577, 0x1a0505, 0.7);
        this.scene.add(this.lights.hemi);

        // Dim ambient fill
        this.lights.ambient = new THREE.AmbientLight(0x222222, 0.35);
        this.scene.add(this.lights.ambient);

        // Main directional (moonlight)
        this.lights.main = new THREE.DirectionalLight(0x8899cc, 1.0);
        this.lights.main.position.set(30, 80, 40);
        this.lights.main.castShadow = true;
        this.lights.main.shadow.mapSize.set(1024, 1024);
        this.lights.main.shadow.camera.left = -150;
        this.lights.main.shadow.camera.right = 150;
        this.lights.main.shadow.camera.top = 150;
        this.lights.main.shadow.camera.bottom = -150;
        this.scene.add(this.lights.main);

        // Red accent light (war glow from below)
        this.lights.red = new THREE.PointLight(0xcc0000, 1.5, 200);
        this.lights.red.position.set(0, 5, 0);
        this.scene.add(this.lights.red);

        // Rim light
        this.lights.rim = new THREE.DirectionalLight(0x330011, 0.4);
        this.lights.rim.position.set(-40, 20, -40);
        this.scene.add(this.lights.rim);

        // Cool teammate-glow accent, used more once co-op is active
        this.lights.ally = new THREE.PointLight(0x00ccff, 0, 160);
        this.lights.ally.position.set(20, 5, 0);
        this.scene.add(this.lights.ally);
    },

    // Procedural radial-gradient sprite used as a lightweight glow/bloom stand-in
    // (no postprocessing pipeline is bundled, so we fake it with additive sprites)
    _getGlowTexture(hexColor) {
        if (this._glowTextureCache[hexColor]) return this._glowTextureCache[hexColor];
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const c = new THREE.Color(hexColor);
        const rgb = `${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)}`;
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, `rgba(${rgb},0.85)`);
        grad.addColorStop(0.4, `rgba(${rgb},0.35)`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        this._glowTextureCache[hexColor] = tex;
        return tex;
    },

    _makeGlowSprite(hexColor, scale) {
        const mat = new THREE.SpriteMaterial({
            map: this._getGlowTexture(hexColor),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(scale, scale, 1);
        sprite.position.y = -1;
        return sprite;
    },

    // Slow-drifting embers for ambient depth/parallax behind the action
    _buildAtmosphere() {
        const count = 200;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const speeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i*3] = (Math.random() - 0.5) * 400;
            positions[i*3+1] = Math.random() * 60;
            positions[i*3+2] = (Math.random() - 0.5) * 400;
            speeds[i] = 0.05 + Math.random() * 0.15;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xff5500, size: 0.6, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        this.embers = new THREE.Points(geo, mat);
        this.embers.userData.speeds = speeds;
        this.scene.add(this.embers);
    },

    _buildGround() {
        // War-torn ground plane
        const geo = new THREE.PlaneGeometry(400, 400, 64, 64);
        // Displace vertices for uneven terrain
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setZ(i, (Math.random() - 0.5) * 1.5);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            roughness: 0.95,
            metalness: 0.05,
            flatShading: true
        });
        this.ground = new THREE.Mesh(geo, mat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Blood-red grid lines
        const grid = new THREE.GridHelper(400, 40, 0x220000, 0x0a0000);
        grid.position.y = 0.05;
        grid.material.opacity = 0.4;
        grid.material.transparent = true;
        this.scene.add(grid);
    },

    _buildDebris() {
        // Scatter random debris (rocks, wreckage)
        const geos = [
            new THREE.TetrahedronGeometry(1.5, 0),
            new THREE.OctahedronGeometry(1, 0),
            new THREE.BoxGeometry(2, 1, 1.5)
        ];
        const mat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, roughness: 1.0, metalness: 0.0, flatShading: true
        });

        for (let i = 0; i < 80; i++) {
            const geo = geos[Math.floor(Math.random() * geos.length)];
            const m = new THREE.Mesh(geo, mat);
            m.position.set(
                (Math.random() - 0.5) * 350,
                Math.random() * 0.5,
                (Math.random() - 0.5) * 350
            );
            m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            m.scale.setScalar(0.5 + Math.random() * 1.5);
            m.receiveShadow = true;
            this.scene.add(m);
            this.debris.push(m);
        }
    },

    onResize() {
        if (!this.ready) return;
        const w = this.container.clientWidth, h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    },

    // ========== ENTITY MANAGEMENT ==========

    _getEntityColor(type) {
        switch (type) {
            case 'hero': return 0x00ccff;
            case 'ally': return 0x00ffaa;   // co-op teammate
            case 'rival': return 0xffaa00;  // PvP opponent
            case 'enemy': return 0xcc0000;
            case 'boss': return 0xff4400;
            case 'elite': return 0xaa00ff;
            case 'powerup': return 0x00ff88;
            default: return 0xffffff;
        }
    },

    _getEntityGeo(type) {
        switch (type) {
            case 'hero': return new THREE.DodecahedronGeometry(5, 1);
            case 'ally': return new THREE.DodecahedronGeometry(4.5, 1);
            case 'rival': return new THREE.DodecahedronGeometry(4.5, 1);
            case 'boss': return new THREE.IcosahedronGeometry(8, 1);
            case 'elite': return new THREE.OctahedronGeometry(5, 1);
            case 'powerup': return new THREE.OctahedronGeometry(3, 0);
            default: return new THREE.IcosahedronGeometry(4, 0);
        }
    },

    spawn(id, type) {
        if (!this.ready) return null;
        // Remove old if exists
        this.removeEntity(id);

        const color = this._getEntityColor(type);
        const geo = this._getEntityGeo(type);

        const mat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: new THREE.Color(color).multiplyScalar(0.3),
            roughness: 0.3,
            metalness: 0.7,
            flatShading: true
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.position.y = type === 'hero' ? 6 : 4;
        mesh.userData = { type, baseY: mesh.position.y, spawnTime: performance.now() };

        // Soft additive glow behind the mesh (stand-in for a bloom pass)
        const glowScale = type === 'boss' ? 26 : (type === 'hero' || type === 'ally' || type === 'rival') ? 14 : 10;
        mesh.add(this._makeGlowSprite(color, glowScale));

        this.scene.add(mesh);
        this.entities.set(id, mesh);

        // Spawn animation — scale up from 0
        mesh.scale.set(0, 0, 0);
        if (window.anime) {
            anime({
                targets: mesh.scale,
                x: [0, 1], y: [0, 1], z: [0, 1],
                duration: type === 'boss' ? 1200 : 600,
                easing: 'easeOutElastic(1, .5)'
            });
        } else {
            mesh.scale.set(1, 1, 1);
        }

        return mesh;
    },

    updateEntity(id, x, y) {
        if (!this.ready) return;
        const mesh = this.entities.get(id);
        if (!mesh) return;

        // Map 2D screen coords → 3D world coords
        const worldX = (x - window.innerWidth / 2) * 0.3;
        const worldZ = (y - window.innerHeight / 2) * 0.3;

        mesh.position.x = worldX;
        mesh.position.z = worldZ;

        // Idle hover bob
        const t = (performance.now() - (mesh.userData.spawnTime || 0)) * 0.003;
        mesh.position.y = mesh.userData.baseY + Math.sin(t) * 0.8;
        mesh.rotation.y += 0.02;
    },

    removeEntity(id) {
        if (!this.ready) return;
        const mesh = this.entities.get(id);
        if (!mesh) return;

        // Death animation
        if (window.anime) {
            anime({
                targets: mesh.scale,
                x: 0, y: 0, z: 0,
                duration: 300,
                easing: 'easeInQuad',
                complete: () => {
                    this.scene.remove(mesh);
                    if (mesh.geometry) mesh.geometry.dispose();
                    if (mesh.material) mesh.material.dispose();
                }
            });
        } else {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.entities.delete(id);
    },

    // 3D particle burst at a position
    burstAt(x, y, color, count) {
        if (!this.ready) return;
        const worldX = (x - window.innerWidth / 2) * 0.3;
        const worldZ = (y - window.innerHeight / 2) * 0.3;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = worldX;
            positions[i * 3 + 1] = 4;
            positions[i * 3 + 2] = worldZ;
            velocities.push({
                x: (Math.random() - 0.5) * 2,
                y: Math.random() * 3,
                z: (Math.random() - 0.5) * 2
            });
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: new THREE.Color(color),
            size: 0.8,
            transparent: true,
            opacity: 1
        });

        const points = new THREE.Points(geo, mat);
        points.userData = { velocities, life: 60 };
        this.scene.add(points);

        // Animate in the render loop
        const animateBurst = () => {
            if (points.userData.life <= 0) {
                this.scene.remove(points);
                geo.dispose();
                mat.dispose();
                return;
            }
            points.userData.life--;
            mat.opacity = points.userData.life / 60;

            const pos = geo.attributes.position.array;
            for (let i = 0; i < count; i++) {
                pos[i * 3] += velocities[i].x;
                pos[i * 3 + 1] += velocities[i].y;
                pos[i * 3 + 2] += velocities[i].z;
                velocities[i].y -= 0.05; // gravity
            }
            geo.attributes.position.needsUpdate = true;
            requestAnimationFrame(animateBurst);
        };
        animateBurst();
    },

    // Flash the red light on damage
    flashDamage() {
        if (!this.ready) return;
        const light = this.lights.red;
        const origIntensity = light.intensity;
        if (window.anime) {
            anime({
                targets: light,
                intensity: [5, origIntensity],
                duration: 400,
                easing: 'easeOutExpo'
            });
        }
    },

    updateCamera(heroX, heroY, rageMode) {
        if (!this.ready) return;
        const targetX = (heroX - window.innerWidth / 2) * 0.3;
        const targetZ = (heroY - window.innerHeight / 2) * 0.3;

        // Smooth follow
        this.camera.position.x += (targetX - this.camera.position.x) * 0.04;
        this.camera.position.z += (targetZ + 80 - this.camera.position.z) * 0.04;
        this.camera.lookAt(targetX, 0, targetZ);

        // Move red light with hero
        this.lights.red.position.x = targetX;
        this.lights.red.position.z = targetZ;

        // Subtle FOV pulse for tension when the hero is in rage mode
        const targetFov = rageMode ? this._baseFov + 4 : this._baseFov;
        if (Math.abs(this.camera.fov - targetFov) > 0.05) {
            this.camera.fov += (targetFov - this.camera.fov) * 0.08;
            this.camera.updateProjectionMatrix();
        }
    },

    // Fade the teammate accent light in/out based on whether co-op is active
    setAllyGlow(active) {
        if (!this.ready || !this.lights.ally) return;
        this.lights.ally.intensity = active ? 1.2 : 0;
    },

    _animate() {
        if (!this.ready) return;
        requestAnimationFrame(() => this._animate());

        // Drift embers upward and recycle them once they rise too high
        if (this.embers) {
            const pos = this.embers.geometry.attributes.position;
            const speeds = this.embers.userData.speeds;
            for (let i = 0; i < speeds.length; i++) {
                let y = pos.getY(i) + speeds[i];
                if (y > 60) y = 0;
                pos.setY(i, y);
            }
            pos.needsUpdate = true;
            this.embers.rotation.y += 0.0003;
        }

        this.renderer.render(this.scene, this.camera);
    }
};
