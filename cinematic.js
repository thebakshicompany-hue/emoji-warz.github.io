// ========== cinematic.js — Dialogue, Letterbox, Weather, Atmosphere, Conversations ==========

// ========== DIALOGUE / CONVERSATION SYSTEM ==========
const Dialogue = {
    queue: [],
    active: false,
    typing: false,
    typeTimer: null,
    charIndex: 0,
    currentLine: null,
    onComplete: null,
    speakerEl: null,
    textEl: null,
    boxEl: null,

    init() {
        this.boxEl = document.getElementById('dialogue-box');
        this.speakerEl = document.getElementById('dialogue-speaker');
        this.textEl = document.getElementById('dialogue-text');
        if (!this.boxEl) return;

        // Tap/click to advance
        this.boxEl.addEventListener('click', () => this.advance());
        this.boxEl.addEventListener('touchstart', (e) => { e.preventDefault(); this.advance(); }, { passive: false });
    },

    // Start a conversation sequence
    play(lines, onComplete) {
        // lines = [{ speaker: "Name", text: "...", emotion: "angry" }, ...]
        this.queue = [...lines];
        this.onComplete = onComplete || null;
        this.active = true;
        Letterbox.show();
        setTimeout(() => this.nextLine(), 400); // Wait for letterbox
    },

    nextLine() {
        if (this.queue.length === 0) {
            this.close();
            return;
        }
        this.currentLine = this.queue.shift();
        this.speakerEl.innerText = this.currentLine.speaker || '';
        this.textEl.innerText = '';
        this.charIndex = 0;
        this.typing = true;
        this.typeNext();
    },

    typeNext() {
        if (!this.currentLine || this.charIndex >= this.currentLine.text.length) {
            this.typing = false;
            return;
        }
        this.textEl.innerText += this.currentLine.text[this.charIndex];
        this.charIndex++;
        // Variable speed: slower on punctuation
        const ch = this.currentLine.text[this.charIndex - 1];
        const delay = '.!?'.includes(ch) ? 120 : ',;:'.includes(ch) ? 80 : 28;
        this.typeTimer = setTimeout(() => this.typeNext(), delay);
    },

    advance() {
        if (!this.active) return;
        if (this.typing) {
            // Skip to end of current line
            clearTimeout(this.typeTimer);
            this.textEl.innerText = this.currentLine.text;
            this.typing = false;
        } else {
            this.nextLine();
        }
    },

    close() {
        this.active = false;
        if (this.boxEl) this.boxEl.classList.remove('active');
        Letterbox.hide();
        if (this.onComplete) {
            const cb = this.onComplete;
            this.onComplete = null;
            setTimeout(() => cb(), 500);
        }
    },

    show() {
        if (this.boxEl) this.boxEl.classList.add('active');
    }
};

// ========== LETTERBOX ==========
const Letterbox = {
    topEl: null,
    bottomEl: null,

    init() {
        this.topEl = document.getElementById('letterbox-top');
        this.bottomEl = document.getElementById('letterbox-bottom');
    },

    show() {
        if (this.topEl) this.topEl.classList.add('active');
        if (this.bottomEl) this.bottomEl.classList.add('active');
        Dialogue.show();
    },

    hide() {
        if (this.topEl) this.topEl.classList.remove('active');
        if (this.bottomEl) this.bottomEl.classList.remove('active');
    }
};

// ========== WEATHER SYSTEM ==========
const Weather = {
    canvas: null,
    ctx: null,
    particles: [],
    type: 'embers', // embers, dust, ash, rain
    running: false,

    init() {
        this.canvas = document.getElementById('weather-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.running = true;
        this.populate();
    },

    resize() {
        if (!this.canvas) return;
        const world = document.getElementById('game-world');
        if (!world) return;
        const r = world.getBoundingClientRect();
        this.canvas.width = r.width;
        this.canvas.height = r.height;
    },

    populate() {
        this.particles = [];
        const count = this.type === 'rain' ? 80 : 30;
        const w = this.canvas ? this.canvas.width : 300;
        const h = this.canvas ? this.canvas.height : 500;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: 1 + Math.random() * 2.5,
                speedX: (Math.random() - 0.3) * 0.4,
                speedY: this.type === 'rain' ? 3 + Math.random() * 4 : 0.2 + Math.random() * 0.5,
                opacity: 0.2 + Math.random() * 0.5,
                flicker: Math.random() * Math.PI * 2
            });
        }
    },

    setType(type) {
        this.type = type;
        this.populate();
    },

    update(dt) {
        if (!this.ctx || !this.running) return;
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        for (const p of this.particles) {
            p.x += p.speedX * (dt / 16);
            p.y += p.speedY * (dt / 16);
            p.flicker += 0.02;

            // Wrap around
            if (p.y > h + 5) { p.y = -5; p.x = Math.random() * w; }
            if (p.x > w + 5) p.x = -5;
            if (p.x < -5) p.x = w + 5;

            ctx.save();
            const alpha = p.opacity * (0.7 + 0.3 * Math.sin(p.flicker));
            ctx.globalAlpha = alpha;

            if (this.type === 'embers') {
                ctx.fillStyle = Math.random() > 0.5 ? '#ff6600' : '#ff4400';
                ctx.shadowColor = '#ff4400';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.type === 'dust') {
                ctx.fillStyle = 'rgba(180,160,140,0.4)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.type === 'ash') {
                ctx.fillStyle = 'rgba(100,100,100,0.5)';
                ctx.fillRect(p.x, p.y, p.size, p.size * 0.5);
            } else if (this.type === 'rain') {
                ctx.strokeStyle = 'rgba(150,180,255,0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - 1, p.y + p.size * 4);
                ctx.stroke();
            }
            ctx.restore();
        }
    }
};

// ========== CINEMATIC IMPACT FRAME ==========
function cinematicImpact() {
    const world = document.getElementById('game-world');
    if (!world) return;
    const f = document.createElement('div');
    f.className = 'impact-frame';
    world.appendChild(f);
    setTimeout(() => { if (f.parentNode) f.remove(); }, 150);
}

// ========== CINEMATIC KILLCAM ==========
function cinematicKillcam() {
    const world = document.getElementById('game-world');
    if (!world) return;
    world.classList.add('killcam-zoom');
    setTimeout(() => world.classList.remove('killcam-zoom'), 800);
}

// ========== CONVERSATION SCRIPTS ==========
const CONVERSATIONS = {
    // Boss level intro conversations
    bossIntro10: [
        { speaker: 'HERO', text: 'Something feels wrong... the air is heavy.' },
        { speaker: '???', text: 'You dare enter MY domain, little emoji?' },
        { speaker: 'HERO', text: 'Show yourself! I\'m not afraid.' },
        { speaker: 'BOSS', text: 'Then you\'re a fool. This arena will be your grave.' }
    ],
    bossIntro20: [
        { speaker: 'HERO', text: 'Another one? They just keep getting uglier.' },
        { speaker: 'BOSS', text: 'Arrogance. I\'ve crushed hundreds like you.' },
        { speaker: 'HERO', text: 'Hundreds? I\'ll make it hundreds and one then.' }
    ],
    bossIntro50: [
        { speaker: 'HERO', text: 'Halfway there... I can feel the darkness growing.' },
        { speaker: 'BOSS', text: 'You\'ve done well to reach me. But this is where your story ends.' },
        { speaker: 'HERO', text: 'My story is just getting started.' },
        { speaker: 'BOSS', text: 'We shall see, warrior. We shall see.' }
    ],
    bossIntro100: [
        { speaker: 'HERO', text: 'Level 100... The prophecy spoke of this place.' },
        { speaker: 'DARK LORD', text: 'The prophecy? You believe in fairy tales?' },
        { speaker: 'HERO', text: 'I believe in what got me here. My strength.' },
        { speaker: 'DARK LORD', text: 'Strength is meaningless before absolute power!' }
    ],
    finalBoss: [
        { speaker: 'HERO', text: '...So you\'re the one behind all of this.' },
        { speaker: 'KING DEVIL 👑😈👑', text: 'A thousand levels. A thousand corpses. And still you come.' },
        { speaker: 'HERO', text: 'For every emoji you\'ve corrupted. For every life you\'ve destroyed.' },
        { speaker: 'KING DEVIL 👑😈👑', text: 'How poetic. Let me compose your eulogy.' },
        { speaker: 'HERO', text: 'The only thing ending today... is you.' }
    ],
    // Rescue conversations
    rescue: [
        { speaker: 'RESCUED ALLY', text: 'Thank you! I thought I\'d never escape!' },
        { speaker: 'HERO', text: 'Stay behind me. I\'ll keep you safe.' }
    ],
    // Death conversation
    death: [
        { speaker: 'HERO', text: '...Not... like this...' },
        { speaker: '???', text: 'Rest now, warrior. Your fight is over.' }
    ],
    // Victory
    victory: [
        { speaker: 'HERO', text: 'It\'s... it\'s over. We won.' },
        { speaker: 'NARRATOR', text: 'The darkness receded. The Emoji Kingdom was saved.' },
        { speaker: 'NARRATOR', text: 'But legends say... evil never truly dies. It only waits.' },
        { speaker: 'HERO', text: '...And I\'ll be ready.' }
    ]
};

// Get boss conversation for a level
function getBossConversation(level) {
    if (level >= 1000) return CONVERSATIONS.finalBoss;
    if (level >= 100) return CONVERSATIONS.bossIntro100;
    if (level >= 50) return CONVERSATIONS.bossIntro50;
    if (level >= 20) return CONVERSATIONS.bossIntro20;
    return CONVERSATIONS.bossIntro10;
}

// Change weather based on level
function updateWeatherForLevel(level) {
    if (level >= 80) Weather.setType('ash');
    else if (level >= 50) Weather.setType('embers');
    else if (level >= 20) Weather.setType('dust');
    else Weather.setType('embers');
}
