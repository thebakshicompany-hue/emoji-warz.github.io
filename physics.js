// ========== physics.js — GPU Particle Engine, Camera, Slow-Mo, Hazards ==========

// ========== PARTICLE CANVAS ==========
const ParticleEngine = {
    canvas: null,
    ctx: null,
    particles: [],
    hazards: [],
    telegraphs: [],
    running: false,

    init() {
        this.canvas = document.getElementById('particle-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.running = true;
    },

    resize() {
        if (!this.canvas) return;
        const world = document.getElementById('game-world');
        if (!world) return;
        const rect = world.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    },

    // Core particle spawner
    emit(x, y, config) {
        const count = config.count || 10;
        for (let i = 0; i < count; i++) {
            const angle = config.angle != null ? config.angle + (Math.random() - 0.5) * (config.spread || 0.5)
                : Math.random() * Math.PI * 2;
            const speed = (config.speed || 3) + Math.random() * (config.speedVar || 2);
            const size = (config.size || 3) + Math.random() * (config.sizeVar || 2);
            const life = (config.life || 400) + Math.random() * (config.lifeVar || 200);

            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                ax: config.ax || 0,
                ay: config.gravity || 0.15,
                size,
                startSize: size,
                life,
                maxLife: life,
                color: Array.isArray(config.colors) ? config.colors[Math.floor(Math.random() * config.colors.length)] : (config.color || '#ff4444'),
                friction: config.friction || 0.98,
                shrink: config.shrink !== false,
                glow: config.glow || false,
                shape: config.shape || 'circle', // circle, square, spark
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                bounce: config.bounce || false
            });
        }
    },

    // Pre-built effects
    explosion(x, y, intensity = 1) {
        // Fire core
        this.emit(x, y, {
            count: Math.floor(15 * intensity), speed: 4 * intensity, speedVar: 3,
            colors: ['#ff4400', '#ff8800', '#ffcc00', '#ffffff'],
            size: 4, sizeVar: 4, life: 300, lifeVar: 200, gravity: -0.05, glow: true
        });
        // Sparks
        this.emit(x, y, {
            count: Math.floor(10 * intensity), speed: 6 * intensity, speedVar: 4,
            colors: ['#ffff00', '#ffffff', '#ff8800'],
            size: 1.5, sizeVar: 1, life: 200, lifeVar: 150, gravity: 0.2, shape: 'spark'
        });
        // Smoke
        this.emit(x, y, {
            count: Math.floor(6 * intensity), speed: 1, speedVar: 1.5,
            colors: ['rgba(40,40,40,0.6)', 'rgba(80,80,80,0.4)', 'rgba(60,60,60,0.5)'],
            size: 8, sizeVar: 6, life: 600, lifeVar: 300, gravity: -0.08, friction: 0.96
        });
    },

    bloodBurst(x, y, dirX, dirY) {
        const angle = Math.atan2(dirY, dirX);
        this.emit(x, y, {
            count: 12, angle, spread: 1.2, speed: 4, speedVar: 3,
            colors: ['#880000', '#aa0000', '#660000', '#cc0000'],
            size: 2.5, sizeVar: 2, life: 400, lifeVar: 200, gravity: 0.3
        });
        // Blood drops
        this.emit(x, y, {
            count: 6, speed: 2, speedVar: 2,
            colors: ['#880000', '#aa0000'],
            size: 4, sizeVar: 3, life: 800, lifeVar: 300, gravity: 0.4, shape: 'circle', bounce: true
        });
    },

    critFlash(x, y) {
        this.emit(x, y, {
            count: 25, speed: 8, speedVar: 4,
            colors: ['#ffffff', '#ffff00', '#ff00ff', '#ff4400'],
            size: 2, sizeVar: 2, life: 200, lifeVar: 100, gravity: 0, friction: 0.92, glow: true, shape: 'spark'
        });
        // Impact ring
        this.emit(x, y, {
            count: 20, speed: 3, speedVar: 0.5,
            color: '#ffffff',
            size: 1.5, sizeVar: 0.5, life: 150, gravity: 0, friction: 0.95, glow: true
        });
    },

    fireTrail(x, y) {
        this.emit(x, y, {
            count: 3, speed: 0.5, speedVar: 1,
            colors: ['#ff4400', '#ff8800', '#ffcc00'],
            size: 3, sizeVar: 2, life: 250, lifeVar: 100, gravity: -0.15, glow: true, shrink: true
        });
    },

    dodgeTrail(x, y) {
        this.emit(x, y, {
            count: 5, speed: 0.3, speedVar: 0.5,
            colors: ['rgba(0,170,255,0.6)', 'rgba(0,240,255,0.4)', 'rgba(100,200,255,0.3)'],
            size: 6, sizeVar: 4, life: 300, lifeVar: 100, gravity: 0, friction: 0.95
        });
    },

    bossEntrance(x, y) {
        // Shockwave ring
        this.emit(x, y, {
            count: 40, speed: 6, speedVar: 2,
            colors: ['#ff0000', '#ff4400', '#ffaa00'],
            size: 3, sizeVar: 2, life: 500, lifeVar: 200, gravity: 0, friction: 0.96, glow: true
        });
        // Ground debris
        this.emit(x, y, {
            count: 20, speed: 4, speedVar: 3,
            colors: ['#444444', '#666666', '#333333', '#555555'],
            size: 3, sizeVar: 3, life: 800, lifeVar: 400, gravity: 0.4, shape: 'square'
        });
        // Energy flash
        this.emit(x, y, {
            count: 30, speed: 10, speedVar: 5,
            colors: ['#ffffff', '#ff00ff', '#8800ff'],
            size: 1.5, sizeVar: 1, life: 150, lifeVar: 50, gravity: 0, shape: 'spark', glow: true
        });
    },

    levelUpBurst(x, y) {
        this.emit(x, y, {
            count: 30, speed: 3, speedVar: 2,
            colors: ['#00ff88', '#00f0ff', '#88ff00', '#ffffff'],
            size: 3, sizeVar: 2, life: 600, lifeVar: 300, gravity: -0.1, glow: true
        });
    },

    deathShatter(x, y) {
        // Big explosion
        this.explosion(x, y, 2.5);
        // Soul fragments
        this.emit(x, y, {
            count: 15, speed: 2, speedVar: 3,
            colors: ['rgba(255,255,255,0.8)', 'rgba(200,200,255,0.6)'],
            size: 5, sizeVar: 3, life: 1000, lifeVar: 500, gravity: -0.2, friction: 0.97, glow: true
        });
    },

    // ========== HAZARDS ==========
    spawnHazard(x, y, type, duration) {
        const h = { x, y, type, life: duration, maxLife: duration, radius: type === 'lava' ? 40 : 25, active: true };
        this.hazards.push(h);
        return h;
    },

    // ========== TELEGRAPHS ==========
    spawnTelegraph(x, y, radius, duration, color) {
        this.telegraphs.push({ x, y, radius, life: duration, maxLife: duration, color: color || 'rgba(255,0,0,0.3)' });
    },

    // ========== UPDATE ==========
    update(dt) {
        if (!this.ctx || !this.running) return;
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Update & draw telegraphs
        for (let i = this.telegraphs.length - 1; i >= 0; i--) {
            const t = this.telegraphs[i];
            t.life -= dt;
            if (t.life <= 0) { this.telegraphs.splice(i, 1); continue; }

            const progress = 1 - (t.life / t.maxLife);
            ctx.save();
            ctx.globalAlpha = 0.15 + progress * 0.35;
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius * progress, 0, Math.PI * 2);
            ctx.fill();
            // Pulsing border
            ctx.strokeStyle = t.color.replace('0.3', '0.8');
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius * progress, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Update & draw hazards
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            const hz = this.hazards[i];
            hz.life -= dt;
            if (hz.life <= 0) { this.hazards.splice(i, 1); continue; }

            const alpha = Math.min(1, hz.life / 500); // Fade out last 500ms
            ctx.save();

            if (hz.type === 'lava') {
                ctx.globalAlpha = alpha * 0.6;
                const grad = ctx.createRadialGradient(hz.x, hz.y, 0, hz.x, hz.y, hz.radius);
                grad.addColorStop(0, '#ff4400');
                grad.addColorStop(0.5, '#ff2200');
                grad.addColorStop(1, 'rgba(100,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI * 2);
                ctx.fill();
                // Bubbles
                if (Math.random() < 0.1) {
                    this.emit(hz.x + (Math.random() - 0.5) * hz.radius, hz.y + (Math.random() - 0.5) * hz.radius, {
                        count: 1, speed: 0.5, colors: ['#ff8800', '#ffcc00'], size: 2, sizeVar: 1, life: 300, gravity: -0.2, glow: true
                    });
                }
            } else if (hz.type === 'spikes') {
                ctx.globalAlpha = alpha * 0.7;
                ctx.fillStyle = '#444444';
                // Draw spike pattern
                for (let s = 0; s < 5; s++) {
                    const sx = hz.x + Math.cos(s * Math.PI * 2 / 5) * hz.radius * 0.6;
                    const sy = hz.y + Math.sin(s * Math.PI * 2 / 5) * hz.radius * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy - 8);
                    ctx.lineTo(sx - 4, sy + 4);
                    ctx.lineTo(sx + 4, sy + 4);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();

            // Damage check (handled in combat.js updateHazards)
        }

        // Update & draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }

            // Physics
            p.vx += p.ax; p.vy += p.ay;
            p.vx *= p.friction; p.vy *= p.friction;
            p.x += p.vx * (dt / 16); p.y += p.vy * (dt / 16);
            p.rotation += p.rotSpeed;

            // Bounce off floor
            if (p.bounce && p.y > h - 5) {
                p.y = h - 5;
                p.vy *= -0.5;
                p.vx *= 0.8;
            }

            const lifeRatio = p.life / p.maxLife;
            const alpha = Math.min(1, lifeRatio * 2); // Fade out near end
            const size = p.shrink ? p.startSize * lifeRatio : p.size;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            if (p.glow) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = size * 3;
            }

            ctx.fillStyle = p.color;

            if (p.shape === 'spark') {
                // Elongated spark
                ctx.beginPath();
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                const len = Math.max(size * 2, speed * 2);
                ctx.ellipse(0, 0, len, size * 0.3, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
                ctx.fill();
            } else if (p.shape === 'square') {
                ctx.fillRect(-size / 2, -size / 2, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    },

    clear() {
        this.particles.length = 0;
        this.hazards.length = 0;
        this.telegraphs.length = 0;
        if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
};

// ========== CAMERA SYSTEM ==========
const Camera = {
    targetEl: null,
    animation: null,

    init(el) { this.targetEl = el; },

    shake(intensity, duration) {
        if (!this.targetEl || !window.anime) return;
        if (this.animation) this.animation.pause();
        
        this.animation = anime({
            targets: this.targetEl,
            translateX: () => anime.random(-intensity, intensity),
            translateY: () => anime.random(-intensity, intensity),
            duration: duration,
            easing: 'easeInOutQuad',
            direction: 'alternate',
            loop: true,
            complete: () => {
                this.targetEl.style.transform = 'translate3d(0,0,0)';
                this.animation = null;
            }
        });

        // Decay shake over time
        setTimeout(() => {
            if (this.animation) this.animation.pause();
            anime({
                targets: this.targetEl,
                translateX: 0,
                translateY: 0,
                duration: 200,
                easing: 'easeOutQuad'
            });
        }, duration);
    },

    update(dt) {
        // No longer needed manual update as anime.js handles it
    }
};

// ========== TIME SCALE (SLOW-MO / HITLAG) ==========
const TimeScale = {
    current: 1,

    set(scale, duration) {
        if (!window.anime) { this.current = scale; return; }
        
        anime({
            targets: this,
            current: scale,
            duration: duration * 0.2,
            easing: 'easeOutExpo',
            complete: () => {
                anime({
                    targets: this,
                    current: 1,
                    delay: duration * 0.6,
                    duration: duration * 0.2,
                    easing: 'easeInQuad'
                });
            }
        });
    },

    update() {
        // anime.js updates the 'current' property automatically
    },

    get() { return this.current; }
};

// ========== HAPTIC FEEDBACK ==========
const Haptics = {
    light() { if (navigator.vibrate) navigator.vibrate(15); },
    medium() { if (navigator.vibrate) navigator.vibrate(30); },
    heavy() { if (navigator.vibrate) navigator.vibrate([30, 10, 50]); },
    crit() { if (navigator.vibrate) navigator.vibrate([10, 5, 40, 5, 20]); },
    death() { if (navigator.vibrate) navigator.vibrate([50, 30, 100, 30, 200]); }
};

// ========== FPS COUNTER ==========
const FPSCounter = {
    frames: 0,
    lastCheck: 0,
    fps: 0,
    el: null,

    init() {
        this.el = document.getElementById('fps-counter');
        this.lastCheck = performance.now();
    },

    tick() {
        this.frames++;
        const now = performance.now();
        if (now - this.lastCheck >= 500) {
            this.fps = Math.round(this.frames / ((now - this.lastCheck) / 1000));
            this.frames = 0;
            this.lastCheck = now;
            if (this.el) this.el.innerText = `${this.fps} FPS`;
        }
    }
};
