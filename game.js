// ========== CONFIG ==========
const ENEMY_EMOJIS = ['skull', 'ghost', 'biohazard', 'radiation', 'bomb', 'flame', 'crosshair', 'target', 'axe', 'sword'];
const BOSS_EMOJIS = ['skull', 'flame', 'tornado', 'eye', 'zap'];
const FINAL_BOSS_EMOJI = 'crown';
const RESCUED_POOL = ['user', 'users', 'shield-check', 'swords'];
const POWERUP_TYPES = [
    { emoji: 'heart', type: 'health', label: '+HP' },
    { emoji: 'zap', type: 'speed', label: 'SPEED!' },
    { emoji: 'swords', type: 'damage', label: 'POWER!' },
    { emoji: 'shield', type: 'shield', label: 'SHIELD!' }
];
const HERO_CLASSES = {
    balanced: { emoji:'sword', maxHp:100, hp:100, damage:10, attackSpeed:800, critChance:0.1, speed:3, range:100, hpRegen:0.5, abilityCD:8000, abilityIcon:'zap', projEmoji:null },
    tank:     { emoji:'shield', maxHp:250, hp:250, damage:12, attackSpeed:1200, critChance:0.05, speed:2, range:80, hpRegen:2, abilityCD:10000, abilityIcon:'shield-alert', projEmoji:null },
    assassin: { emoji:'scissors', maxHp:60, hp:60, damage:15, attackSpeed:500, critChance:0.3, speed:4.5, range:80, hpRegen:0, abilityCD:6000, abilityIcon:'user-x', projEmoji:null },
    mage:     { emoji:'eye', maxHp:80, hp:80, damage:25, attackSpeed:1000, critChance:0.1, speed:2.5, range:350, hpRegen:0.3, abilityCD:7000, abilityIcon:'flame', projEmoji:'sparkles' },
    archer:   { emoji:'crosshair', maxHp:90, hp:90, damage:18, attackSpeed:600, critChance:0.2, speed:3.5, range:400, hpRegen:0, abilityCD:8000, abilityIcon:'target', projEmoji:'arrow-right' }
};
const MARKET_ITEMS = {
    skins: [
        { id:'skin_base', name:'Default', type:'skin', cost:0, emoji:'sword' },
        { id:'skin_ninja', name:'Wraith', type:'skin', cost:500, emoji:'ghost' },
        { id:'skin_demon', name:'Hellspawn', type:'skin', cost:1500, emoji:'skull' },
        { id:'skin_mech', name:'Dreadnought', type:'skin', cost:3000, emoji:'cpu' }
    ],
    auras: [
        { id:'aura_none', name:'No Aura', type:'aura', cost:0, class:'' },
        { id:'aura_fire', name:'Flame Aura', type:'aura', cost:1000, class:'aura-fire' },
        { id:'aura_void', name:'Void Aura', type:'aura', cost:2500, class:'aura-void' }
    ]
};
const STORY_LINES = [
    "War came without warning.",
    "The dead rose. The sky turned black.",
    "Every kingdom fell. Every army was slaughtered.",
    "One warrior remains. One last chance.",
    "Kill or be killed. There is no mercy here."
];

// ========== STATE ==========
let state = {
    isRunning: false, level: 1, isGuest: false, points: 0, enemiesDefeatedInLevel: 0, enemiesRequiredForNextLevel: 5,
    lastTick: 0, lastAttackTime: 0, totalLifetimePoints: 0, unlockedItems: ['skin_base','aura_none'],
    equippedSkin: 'skin_base', equippedAura: 'aura_none',
    player: { ...HERO_CLASSES['balanced'] }, selectedClass: 'balanced',
    heroElement: null, heroPosition: { x: 100, y: 200 }, heroTarget: { x: 100, y: 200 },
    heroVelocity: { x: 0, y: 0 }, // Momentum
    enemies: [], rescued: [], projectiles: [], powerups: [],
    upgrades: {
        damage: { level:1, cost:10, baseCost:10, mult:1.5, costMult:1.5 },
        health: { level:1, cost:15, baseCost:15, mult:1.5, costMult:1.5 },
        speed:  { level:1, cost:20, baseCost:20, mult:0.9, costMult:1.8 }
    },
    // Input
    joystickActive: false, joystickDir: { x:0, y:0 }, keys: {},
    attackHeld: false, lastManualAttack: 0,
    // Combat
    combo: 0, lastComboHit: 0, comboMult: 1, comboSwing: 0,
    isDodging: false, dodgeCooldown: 0, lastDodgeTime: 0,
    abilityCooldown: 0, lastAbilityTime: 0,
    activeBuffs: [],
    waveTimer: 0, waveTimerMax: 0, betweenWaves: false,
    // Rage
    rageMode: false, rageOverlay: null,
    // Trails
    lastTrailTime: 0
};

// ========== POCKETBASE ==========
const pb = new PocketBase('https://pocketbase.bdpro.in');

// ========== SOUND ENGINE ==========
const SFX = {
    ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    tone(hz, type='sine', dur=0.1, vol=0.1) {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(hz, this.ctx.currentTime);
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
    },
    shoot() { this.tone(800,'square',0.1,0.05); },
    crit() { this.tone(1200,'square',0.15,0.08); },
    hit() { this.tone(150,'sawtooth',0.15,0.1); },
    coin() { this.tone(1200,'sine',0.1,0.05); setTimeout(()=>this.tone(1600,'sine',0.2,0.05),50); },
    levelUp() { [440,554,659,880].forEach((hz,i)=>setTimeout(()=>this.tone(hz,'sine',0.3,0.1),i*100)); },
    upgrade() { this.tone(600,'triangle',0.1,0.1); setTimeout(()=>this.tone(900,'triangle',0.3,0.1),100); },
    dodge() { this.tone(400,'sine',0.1,0.06); this.tone(600,'sine',0.1,0.06); },
    ability() { [300,500,700,900].forEach((hz,i)=>setTimeout(()=>this.tone(hz,'triangle',0.2,0.08),i*60)); },
    pickup() { this.tone(800,'sine',0.08,0.06); setTimeout(()=>this.tone(1000,'sine',0.08,0.06),60); setTimeout(()=>this.tone(1200,'sine',0.15,0.06),120); },
    gameOver() {
        if (!this.ctx) return;
        const o=this.ctx.createOscillator(), g=this.ctx.createGain();
        o.type='sawtooth'; o.frequency.setValueAtTime(300,this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(10,this.ctx.currentTime+1.5);
        g.gain.setValueAtTime(0.3,this.ctx.currentTime); g.gain.linearRampToValueAtTime(0,this.ctx.currentTime+1.5);
        o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+1.5);
    }
};

// ========== DOM ==========
const $ = id => document.getElementById(id);
const els = {
    screens: { login:$('login-screen'), register:$('register-screen'), start:$('start-screen'), story:$('story-screen'), charSelect:$('char-select-screen'), game:$('game-ui'), end:$('end-screen') },
    auth: { email:$('login-email'), pass:$('login-pass'), error:$('login-error'), regEmail:$('reg-email'), regPass:$('reg-pass'), regPassConfirm:$('reg-pass-confirm'), regError:$('reg-error'), regSuccess:$('reg-success') },
    hud: { healthBar:$('hero-hp-fill'), healthText:$('health-text'), levelDisplay:$('level-display'), levelProgress:$('level-progress'), pointsDisplay:$('points-display'), rescuedContainer:$('rescued-container') },
    world: $('game-world'), textLayer: $('damage-text-layer'), warning: $('boss-warning'), saveToast: $('save-toast'),
    storyText: $('story-text'),
    upgrades: { storeRef:$('upgrade-store'), dmgBtn:$('upg-damage'), dmgCost:$('cost-damage'), dmgLvl:$('lvl-damage'), hpBtn:$('upg-health'), hpCost:$('cost-health'), hpLvl:$('lvl-health'), spdBtn:$('upg-speed'), spdCost:$('cost-speed'), spdLvl:$('lvl-speed'), healBtn:$('btn-heal') },
    marketplace: { screen:$('marketplace-screen'), skinsGrid:$('skins-grid'), aurasGrid:$('auras-grid'), pointsDisplay:$('market-points-display') },
    combo: { display:$('combo-display'), count:$('combo-count'), mult:$('combo-mult') },
    buffs: $('active-buffs'),
    wave: { timer:$('wave-timer'), countdown:$('wave-countdown') },
    joystick: { zone:$('joystick-zone'), base:$('joystick-base'), thumb:$('joystick-thumb') },
    buttons: { guest:$('guest-btn'), skip100:$('skip-100-btn'), attack:$('attack-btn'), dodge:$('dodge-btn'), ability:$('ability-btn'), abilityIcon:$('ability-icon'), dodgeCD:$('dodge-cooldown-overlay'), abilityCD:$('ability-cooldown-overlay'), login:$('login-btn'), register:$('register-btn'), goToRegister:$('go-to-register'), goToLogin:$('go-to-login'), start:$('start-btn'), load:$('load-btn'), save:$('save-btn'), skipStory:$('skip-btn'), restart:$('restart-btn'), marketStart:$('marketplace-btn-start'), marketEnd:$('marketplace-btn-end'), closeMarket:$('close-marketplace-btn'), saveQuit:$('save-quit-btn'), storeToggle:$('store-toggle-btn'), storeClose:$('close-store-btn') }
};

// ========== INIT ==========
function init() {
    bindEvents();
    loadGlobalProgress();
    renderMarketplace();
    if (pb.authStore.isValid) showScreen('start');
}

let typeWriterTimeout;

function bindEvents() {
    // Auth
    els.buttons.login.addEventListener('click', handleLogin);
    els.buttons.register.addEventListener('click', handleRegistration);
    els.buttons.guest.addEventListener('click', () => { state.isGuest = true; showScreen('start'); });
    els.buttons.goToRegister.addEventListener('click', () => { showScreen('register'); clearAuthErrors(); });
    els.buttons.goToLogin.addEventListener('click', () => { showScreen('login'); clearAuthErrors(); });

    // Nav
    els.buttons.start.addEventListener('click', () => { state.level = 1; showStoryScreen(); });
    els.buttons.skip100.addEventListener('click', () => { state.level = 100; showStoryScreen(); });
    els.buttons.load.addEventListener('click', loadGame);
    els.buttons.save.addEventListener('click', saveGame);
    els.buttons.skipStory.addEventListener('click', () => { clearTimeout(typeWriterTimeout); showScreen('charSelect'); });
    els.buttons.restart.addEventListener('click', resetGame);
    els.buttons.saveQuit.addEventListener('click', () => { saveGame(); state.isRunning = false; showScreen('start'); });

    // Marketplace
    els.buttons.marketStart.addEventListener('click', showMarketplace);
    els.buttons.marketEnd.addEventListener('click', showMarketplace);
    els.buttons.closeMarket.addEventListener('click', () => {
        els.marketplace.screen.classList.remove('active'); els.marketplace.screen.classList.add('hidden');
        if (state.isRunning) { els.screens.game.classList.add('active'); els.screens.game.classList.remove('hidden'); }
        else { els.screens.start.classList.add('active'); els.screens.start.classList.remove('hidden'); }
    });

    // Character select
    document.querySelectorAll('.char-card').forEach(card => {
        card.addEventListener('click', () => { state.selectedClass = card.dataset.hero; startGame(); });
    });

    // Store
    els.upgrades.dmgBtn.addEventListener('click', () => buyUpgrade('damage'));
    els.upgrades.hpBtn.addEventListener('click', () => buyUpgrade('health'));
    els.upgrades.spdBtn.addEventListener('click', () => buyUpgrade('speed'));
    els.upgrades.healBtn.addEventListener('click', () => {
        if (state.points >= 5 && state.player.hp < state.player.maxHp) { state.points -= 5; healPlayer(state.player.maxHp * 0.5); updateUI(); }
    });
    els.buttons.storeToggle.addEventListener('click', () => els.upgrades.storeRef.classList.toggle('hidden'));
    els.buttons.storeClose.addEventListener('click', () => els.upgrades.storeRef.classList.add('hidden'));

    // ===== MOBILE CONTROLS =====
    // Joystick
    let joystickOrigin = { x:0, y:0 }, joystickTouchId = null;
    els.joystick.zone.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joystickTouchId = t.identifier;
        joystickOrigin = { x: t.clientX, y: t.clientY };
        const rect = els.joystick.zone.getBoundingClientRect();
        els.joystick.base.style.left = `${t.clientX - rect.left - 60}px`;
        els.joystick.base.style.top = `${t.clientY - rect.top - 60}px`;
        els.joystick.base.classList.remove('hidden');
        state.joystickActive = true;
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (!state.joystickActive) return;
        for (const t of e.changedTouches) {
            if (t.identifier === joystickTouchId) {
                const dx = t.clientX - joystickOrigin.x, dy = t.clientY - joystickOrigin.y;
                const dist = Math.sqrt(dx*dx + dy*dy), maxDist = 45;
                const clampDist = Math.min(dist, maxDist);
                const angle = Math.atan2(dy, dx);
                const cx = Math.cos(angle) * clampDist, cy = Math.sin(angle) * clampDist;
                els.joystick.thumb.style.transform = `translate(${cx}px, ${cy}px)`;
                state.joystickDir = { x: cx / maxDist, y: cy / maxDist };
            }
        }
    }, { passive: false });

    const releaseJoystick = e => {
        for (const t of e.changedTouches) {
            if (t.identifier === joystickTouchId) {
                state.joystickActive = false;
                state.joystickDir = { x:0, y:0 };
                els.joystick.base.classList.add('hidden');
                els.joystick.thumb.style.transform = '';
                joystickTouchId = null;
            }
        }
    };
    document.addEventListener('touchend', releaseJoystick);
    document.addEventListener('touchcancel', releaseJoystick);

    // Attack button
    els.buttons.attack.addEventListener('touchstart', e => { e.preventDefault(); state.attackHeld = true; });
    els.buttons.attack.addEventListener('touchend', e => { e.preventDefault(); state.attackHeld = false; });
    els.buttons.attack.addEventListener('touchcancel', () => state.attackHeld = false);
    els.buttons.attack.addEventListener('mousedown', e => { e.preventDefault(); state.attackHeld = true; });
    els.buttons.attack.addEventListener('mouseup', () => state.attackHeld = false);

    // Dodge button
    els.buttons.dodge.addEventListener('touchstart', e => { e.preventDefault(); performDodge(); });
    els.buttons.dodge.addEventListener('click', performDodge);

    // Ability button
    els.buttons.ability.addEventListener('touchstart', e => { e.preventDefault(); performAbility(); });
    els.buttons.ability.addEventListener('click', performAbility);

    // Keyboard fallback
    document.addEventListener('keydown', e => {
        state.keys[e.key.toLowerCase()] = true;
        if (e.key === ' ') { e.preventDefault(); state.attackHeld = true; }
        if (e.key === 'Shift') performDodge();
        if (e.key === 'q' || e.key === 'Q') performAbility();
    });
    document.addEventListener('keyup', e => {
        state.keys[e.key.toLowerCase()] = false;
        if (e.key === ' ') state.attackHeld = false;
    });

    // Click-to-move on world (desktop fallback)
    els.world.addEventListener('mousedown', e => {
        if (!state.isRunning) return;
        if (e.target === els.world || e.target.id === 'damage-text-layer' || e.target.id === 'battleground-elements') {
            const rect = els.world.getBoundingClientRect();
            state.heroTarget = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
    });

    // Tap enemies to attack
    els.world.addEventListener('touchstart', e => {
        if (!state.isRunning) return;
        // Don't interfere with joystick
    }, { passive: true });
}

// ========== AUTH ==========
function clearAuthErrors() { els.auth.error.classList.add('hidden'); els.auth.regError.classList.add('hidden'); els.auth.regSuccess.classList.add('hidden'); }

async function handleLogin() {
    const email = els.auth.email.value, pass = els.auth.pass.value;
    if (!email || !pass) return;
    els.buttons.login.innerText = "LOGGING IN..."; els.buttons.login.disabled = true;
    try {
        await pb.collection('users').authWithPassword(email, pass);
        if (pb.authStore.isValid) showScreen('start');
    } catch(e) {
        els.auth.error.innerText = "Invalid credentials"; els.auth.error.classList.remove('hidden');
        els.buttons.login.innerText = "LOGIN"; els.buttons.login.disabled = false;
    }
}

async function handleRegistration() {
    const email = els.auth.regEmail.value, pass = els.auth.regPass.value, pc = els.auth.regPassConfirm.value;
    clearAuthErrors();
    if (!email || !pass || !pc) { els.auth.regError.innerText = "Please fill all fields"; els.auth.regError.classList.remove('hidden'); return; }
    if (pass !== pc) { els.auth.regError.innerText = "Passwords do not match"; els.auth.regError.classList.remove('hidden'); return; }
    if (pass.length < 8) { els.auth.regError.innerText = "Password must be at least 8 characters"; els.auth.regError.classList.remove('hidden'); return; }
    els.buttons.register.innerText = "CREATING..."; els.buttons.register.disabled = true;
    try {
        await pb.collection('users').create({ email, password: pass, passwordConfirm: pc });
        els.auth.regSuccess.classList.remove('hidden');
        await pb.collection('users').authWithPassword(email, pass);
        if (pb.authStore.isValid) setTimeout(() => showScreen('start'), 1000);
    } catch(e) {
        els.auth.regError.innerText = e.response?.message || "Failed to create account.";
        els.auth.regError.classList.remove('hidden');
        els.buttons.register.innerText = "SIGN UP"; els.buttons.register.disabled = false;
    }
}

// ========== SCREEN MANAGEMENT ==========
function showScreen(name) {
    Object.entries(els.screens).forEach(([k, s]) => {
        if (k === name) {
            s.classList.remove('hidden');
            s.classList.add('active');
            if (window.anime) {
                anime({
                    targets: s,
                    opacity: [0, 1],
                    scale: [1.05, 1],
                    duration: 800,
                    easing: 'easeOutQuart'
                });
            }
        } else {
            s.classList.remove('active');
            s.classList.add('hidden');
        }
    });
}

function showStoryScreen() {
    showScreen('story');
    els.storyText.innerHTML = '';
    let lineIdx = 0, charIdx = 0;
    function typeWriter() {
        if (lineIdx < STORY_LINES.length) {
            if (charIdx < STORY_LINES[lineIdx].length) {
                els.storyText.innerHTML += STORY_LINES[lineIdx].charAt(charIdx++);
                typeWriterTimeout = setTimeout(typeWriter, 40);
            } else { els.storyText.innerHTML += '<br><br>'; lineIdx++; charIdx = 0; typeWriterTimeout = setTimeout(typeWriter, 500); }
        } else { els.buttons.skipStory.innerText = "CHOOSE HERO"; }
    }
    typeWriter();
}

// ========== START GAME ==========
function startGame(isLoading = false) {
    showScreen('game');
    SFX.init();

    if (!isLoading) {
        const worldRect = els.world.getBoundingClientRect();
        Object.assign(state, {
            isRunning: true, enemiesDefeatedInLevel: 0, enemiesRequiredForNextLevel: 5,
            enemies: [], rescued: [], projectiles: [], powerups: [],
            player: { ...HERO_CLASSES[state.selectedClass] },
            heroPosition: { x: (worldRect.width||200)/2, y: (worldRect.height||300)/2 },
            heroTarget: { x: (worldRect.width||200)/2, y: (worldRect.height||300)/2 },
            heroVelocity: { x: 0, y: 0 },
            combo: 0, lastComboHit: 0, comboMult: 1, comboSwing: 0, activeBuffs: [],
            isDodging: false, dodgeCooldown: 0, lastDodgeTime: 0,
            abilityCooldown: 0, lastAbilityTime: 0, betweenWaves: false, waveTimer: 0,
            rageMode: false, lastTrailTime: 0
        });
        state.upgrades = {
            damage: { level:1, cost:10, baseCost:10, mult:1.5, costMult:1.5 },
            health: { level:1, cost:15, baseCost:15, mult:1.5, costMult:1.5 },
            speed:  { level:1, cost:20, baseCost:20, mult:0.9, costMult:1.8 }
        };
    } else {
        state.isRunning = true; state.enemies = []; state.projectiles = []; state.powerups = [];
        state.heroVelocity = { x: 0, y: 0 }; state.rageMode = false;
    }

    els.world.innerHTML = '<canvas id="weather-canvas"></canvas><div id="atmosphere-layer"></div><div id="cinematic-vignette"></div><canvas id="particle-canvas"></canvas><div id="rage-overlay"></div><div id="fps-counter">-- FPS</div><div id="battleground-elements"></div><div id="damage-text-layer"></div><div id="letterbox-top"></div><div id="letterbox-bottom"></div><div id="dialogue-box"><div id="dialogue-speaker" class="dialogue-speaker"></div><div id="dialogue-text" class="dialogue-text"></div><div class="dialogue-prompt">TAP TO CONTINUE \u25b6</div></div>';
    els.textLayer = document.getElementById('damage-text-layer');
    state.rageOverlay = document.getElementById('rage-overlay');
    els.buttons.abilityIcon.innerText = state.player.abilityIcon || '\ud83c\udf00';

    // Init all systems
    ParticleEngine.init();
    Camera.init(els.world);
    FPSCounter.init();
    Dialogue.init();
    Letterbox.init();
    Weather.init();
    updateWeatherForLevel(state.level);

    generateBattleground();
    createHero();
    updateUI();
    updateRescuedUI();

    state.lastTick = performance.now();
    requestAnimationFrame(gameLoop);
}

function generateBattleground() {
    const bg = document.getElementById('battleground-elements');
    if (!bg) return;
    const wr = els.world.getBoundingClientRect();
    const w = wr.width || 300, h = wr.height || 400;
    // Blood stains
    for (let i = 0; i < 8; i++) {
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;width:${15+Math.random()*30}px;height:${10+Math.random()*20}px;background:rgba(60,0,0,${0.1+Math.random()*0.15});border-radius:50%;left:${Math.random()*w}px;top:${Math.random()*h}px;transform:rotate(${Math.random()*360}deg);filter:blur(3px);`;
        bg.appendChild(el);
    }
    // Cracks
    for (let i = 0; i < 5; i++) {
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;width:${40+Math.random()*80}px;height:1px;background:rgba(40,20,10,0.3);left:${Math.random()*w}px;top:${Math.random()*h}px;transform:rotate(${Math.random()*180}deg);box-shadow:0 0 3px rgba(30,10,0,0.2);`;
        bg.appendChild(el);
    }
    // Weapon debris
    const debris = ['🗡️','⚔️','🛡️','💀','🦴','⛓️'];
    for (let i = 0; i < 4; i++) {
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;font-size:${10+Math.random()*8}px;opacity:${0.08+Math.random()*0.07};left:${Math.random()*w}px;top:${Math.random()*h}px;transform:rotate(${Math.random()*360}deg);filter:grayscale(1) brightness(0.4);pointer-events:none;`;
        el.innerText = debris[Math.floor(Math.random()*debris.length)];
        bg.appendChild(el);
    }
    // Scorch marks
    for (let i = 0; i < 4; i++) {
        const el = document.createElement('div');
        const size = 20 + Math.random() * 40;
        el.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:radial-gradient(circle,rgba(20,10,0,0.15) 0%,transparent 70%);border-radius:50%;left:${Math.random()*w}px;top:${Math.random()*h}px;`;
        bg.appendChild(el);
    }
}

function resetGame() {
    state.points = 0; state.rescued = []; state.combo = 0; state.activeBuffs = [];
    if (els.hud.rescuedContainer) els.hud.rescuedContainer.innerHTML = '';
    startGame();
}

// ========== GAME LOOP ==========
function gameLoop(t) {
    if (!state.isRunning) return;
    const rawDt = Math.min(t - state.lastTick, 50);
    state.lastTick = t;

    // Apply time scale (hitlag / slow-mo)
    TimeScale.update();
    const dt = rawDt * TimeScale.get();

    FPSCounter.tick();

    moveHero(dt);
    handleAttack(t);
    updateProjectiles(dt);
    updateEnemies(t, dt);
    updatePowerups(dt);
    updateCombo(t);
    updateBuffs(t);
    updateCooldowns(t);
    updateRageMode();
    if (typeof updateHazards === 'function') updateHazards(dt);

    // HP Regen
    if (state.player.hpRegen > 0 && state.player.hp < state.player.maxHp && state.player.hp > 0) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.hpRegen * (dt/1000));
        updateHealthUI();
    }

    // Wave spawn
    if (state.enemies.length === 0 && !state.betweenWaves) {
        state.betweenWaves = true;
        state.waveTimerMax = Math.max(2000, 5000 - state.level * 30);
        state.waveTimer = state.waveTimerMax;
        els.wave.timer.classList.remove('hidden');
    }
    if (state.betweenWaves) {
        state.waveTimer -= dt;
        els.wave.countdown.innerText = Math.max(0, Math.ceil(state.waveTimer / 1000));
        if (state.waveTimer <= 0) {
            state.betweenWaves = false;
            els.wave.timer.classList.add('hidden');
            spawnWave();
        }
    }

    // Physics systems
    Camera.update(dt);
    ParticleEngine.update(dt);
    Weather.update(dt);

    requestAnimationFrame(gameLoop);
}

// ========== HERO ==========
function createHero() {
    if (state.heroElement) state.heroElement.remove();
    const hero = document.createElement('div');
    hero.className = 'entity hero';
    let iconName = state.player.emoji;
    const skin = MARKET_ITEMS.skins.find(s => s.id === state.equippedSkin);
    if (skin && skin.id !== 'skin_base') iconName = skin.emoji;
    hero.innerHTML = `<i data-lucide="${iconName}"></i>`;
    const aura = MARKET_ITEMS.auras.find(a => a.id === state.equippedAura);
    if (aura && aura.id !== 'aura_none') hero.classList.add(aura.class);
    els.world.appendChild(hero);
    state.heroElement = hero;
    updateHeroPos();
    if (window.lucide) window.lucide.createIcons();
}

function updateHeroPos() {
    if (!state.heroElement) return;
    // GPU-composited positioning via transform3d
    state.heroElement.style.transform = `translate3d(${state.heroPosition.x - 30}px, ${state.heroPosition.y - 30}px, 0)`;
    state.heroElement.style.left = '0'; state.heroElement.style.top = '0';
}

function moveHero(dt) {
    if (!state.heroElement || state.isDodging) return;
    const worldRect = els.world.getBoundingClientRect();
    const accel = 0.6; // Acceleration
    const friction = 0.85; // Deceleration friction
    const maxSpeed = state.player.speed * 1.8;

    let inputX = 0, inputY = 0;
    // Joystick
    if (state.joystickActive) { inputX = state.joystickDir.x; inputY = state.joystickDir.y; }
    // Keyboard
    if (state.keys['w'] || state.keys['arrowup']) inputY -= 1;
    if (state.keys['s'] || state.keys['arrowdown']) inputY += 1;
    if (state.keys['a'] || state.keys['arrowleft']) inputX -= 1;
    if (state.keys['d'] || state.keys['arrowright']) inputX += 1;

    if (inputX !== 0 || inputY !== 0) {
        const len = Math.sqrt(inputX*inputX + inputY*inputY);
        // Apply acceleration to velocity
        state.heroVelocity.x += (inputX/len) * accel * (dt / 16);
        state.heroVelocity.y += (inputY/len) * accel * (dt / 16);
        // Clamp speed
        const speed = Math.sqrt(state.heroVelocity.x**2 + state.heroVelocity.y**2);
        if (speed > maxSpeed) {
            state.heroVelocity.x = (state.heroVelocity.x/speed) * maxSpeed;
            state.heroVelocity.y = (state.heroVelocity.y/speed) * maxSpeed;
        }
    } else {
        // Click-to-move fallback
        const tdx = state.heroTarget.x - state.heroPosition.x;
        const tdy = state.heroTarget.y - state.heroPosition.y;
        const dist = Math.sqrt(tdx*tdx + tdy*tdy);
        if (dist > 5) {
            state.heroVelocity.x += (tdx/dist) * accel * (dt/16);
            state.heroVelocity.y += (tdy/dist) * accel * (dt/16);
            const speed = Math.sqrt(state.heroVelocity.x**2 + state.heroVelocity.y**2);
            if (speed > maxSpeed) {
                state.heroVelocity.x = (state.heroVelocity.x/speed) * maxSpeed;
                state.heroVelocity.y = (state.heroVelocity.y/speed) * maxSpeed;
            }
        }
    }

    // Apply friction
    state.heroVelocity.x *= friction;
    state.heroVelocity.y *= friction;

    // Apply velocity to position
    state.heroPosition.x += state.heroVelocity.x * (dt/16);
    state.heroPosition.y += state.heroVelocity.y * (dt/16);

    // Clamp to world bounds
    state.heroPosition.x = Math.max(20, Math.min(worldRect.width - 20, state.heroPosition.x));
    state.heroPosition.y = Math.max(20, Math.min(worldRect.height - 20, state.heroPosition.y));
    updateHeroPos();

    // Momentum trails when moving fast
    const curSpeed = Math.sqrt(state.heroVelocity.x**2 + state.heroVelocity.y**2);
    const now = performance.now();
    if (curSpeed > 2 && now - state.lastTrailTime > 60) {
        state.lastTrailTime = now;
        ParticleEngine.fireTrail(state.heroPosition.x, state.heroPosition.y);
    }
}

function updateRageMode() {
    const hpRatio = state.player.hp / state.player.maxHp;
    const shouldRage = hpRatio > 0 && hpRatio <= 0.25;
    if (shouldRage && !state.rageMode) {
        state.rageMode = true;
        if (state.rageOverlay) state.rageOverlay.classList.add('active');
        if (state.heroElement) state.heroElement.classList.add('rage-mode');
    } else if (!shouldRage && state.rageMode) {
        state.rageMode = false;
        if (state.rageOverlay) state.rageOverlay.classList.remove('active');
        if (state.heroElement) state.heroElement.classList.remove('rage-mode');
    }
}

function createDashTrail(x, y) {
    if (!state.heroElement) return;
    const trail = document.createElement('div');
    trail.className = 'dash-trail'; trail.innerHTML = state.heroElement.innerHTML;
    trail.style.left = `${x}px`; trail.style.top = `${y}px`;
    els.world.appendChild(trail);
    setTimeout(() => { if (trail.parentNode) trail.remove(); }, 300);
}
