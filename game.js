// ========== CONFIG ==========
const ENEMY_EMOJIS = ['💀','☠️','🕷️','🦂','🦇','🩸','🔪','🧨','💣','☣️','☢️'];
const BOSS_EMOJIS = ['👹','👺','🐲','🌋','🌪️','👁️','🪐'];
const FINAL_BOSS_EMOJI = '👑☠️👑';
const RESCUED_POOL = ['🐶','🐱','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🐰','🐢','🦖','🦄','🐝','🐙','🐬','🦀'];
const POWERUP_TYPES = [
    { emoji: '❤️', type: 'health', label: '+HP' },
    { emoji: '⚡', type: 'speed', label: 'SPEED!' },
    { emoji: '💪', type: 'damage', label: 'POWER!' },
    { emoji: '🛡️', type: 'shield', label: 'SHIELD!' }
];
const HERO_CLASSES = {
    balanced: { emoji:'⚔️', maxHp:100, hp:100, damage:10, attackSpeed:800, critChance:0.1, speed:3, range:100, hpRegen:0.5, abilityCD:8000, abilityIcon:'🌀', projEmoji:null },
    tank:     { emoji:'🛡️', maxHp:250, hp:250, damage:12, attackSpeed:1200, critChance:0.05, speed:2, range:80, hpRegen:2, abilityCD:10000, abilityIcon:'🛡️', projEmoji:null },
    assassin: { emoji:'🗡️', maxHp:60, hp:60, damage:15, attackSpeed:500, critChance:0.3, speed:4.5, range:80, hpRegen:0, abilityCD:6000, abilityIcon:'👤', projEmoji:null },
    mage:     { emoji:'🧙', maxHp:80, hp:80, damage:25, attackSpeed:1000, critChance:0.1, speed:2.5, range:350, hpRegen:0.3, abilityCD:7000, abilityIcon:'☄️', projEmoji:'🔥' },
    archer:   { emoji:'🏹', maxHp:90, hp:90, damage:18, attackSpeed:600, critChance:0.2, speed:3.5, range:400, hpRegen:0, abilityCD:8000, abilityIcon:'🌧️', projEmoji:'➳' }
};
const MARKET_ITEMS = {
    skins: [
        { id:'skin_base', name:'Default', type:'skin', cost:0, emoji:'⚔️' },
        { id:'skin_ninja', name:'Shadow Ninja', type:'skin', cost:500, emoji:'🥷' },
        { id:'skin_demon', name:'Demon Lord', type:'skin', cost:1500, emoji:'👺' },
        { id:'skin_mech', name:'Cyborg', type:'skin', cost:3000, emoji:'🤖' }
    ],
    auras: [
        { id:'aura_none', name:'No Aura', type:'aura', cost:0, class:'' },
        { id:'aura_fire', name:'Flame Aura', type:'aura', cost:1000, class:'aura-fire' },
        { id:'aura_void', name:'Void Aura', type:'aura', cost:2500, class:'aura-void' }
    ]
};
const STORY_LINES = ["The Emoji Kingdom lived in harmony...","Until the sinister forces of Darkness emerged.","Corrupted emojis now ravage our lands.","The ultimate evil, King Devil 👑😈👑, awaits at Level 100.","Will you be the hero we need?"];

// ========== STATE ==========
let state = {
    isRunning: false, level: 1, points: 0, enemiesDefeatedInLevel: 0, enemiesRequiredForNextLevel: 5,
    lastTick: 0, lastAttackTime: 0, totalLifetimePoints: 0, unlockedItems: ['skin_base','aura_none'],
    equippedSkin: 'skin_base', equippedAura: 'aura_none',
    player: { ...HERO_CLASSES['balanced'] }, selectedClass: 'balanced',
    heroElement: null, heroPosition: { x: 100, y: 200 }, heroTarget: { x: 100, y: 200 },
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
    combo: 0, lastComboHit: 0, comboMult: 1,
    isDodging: false, dodgeCooldown: 0, lastDodgeTime: 0,
    abilityCooldown: 0, lastAbilityTime: 0,
    activeBuffs: [],
    waveTimer: 0, waveTimerMax: 0, betweenWaves: false
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
    buttons: { attack:$('attack-btn'), dodge:$('dodge-btn'), ability:$('ability-btn'), abilityIcon:$('ability-icon'), dodgeCD:$('dodge-cooldown-overlay'), abilityCD:$('ability-cooldown-overlay'), login:$('login-btn'), register:$('register-btn'), goToRegister:$('go-to-register'), goToLogin:$('go-to-login'), start:$('start-btn'), load:$('load-btn'), save:$('save-btn'), skipStory:$('skip-btn'), restart:$('restart-btn'), marketStart:$('marketplace-btn-start'), marketEnd:$('marketplace-btn-end'), closeMarket:$('close-marketplace-btn'), saveQuit:$('save-quit-btn'), storeToggle:$('store-toggle-btn'), storeClose:$('close-store-btn') }
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
    els.buttons.goToRegister.addEventListener('click', () => { showScreen('register'); clearAuthErrors(); });
    els.buttons.goToLogin.addEventListener('click', () => { showScreen('login'); clearAuthErrors(); });

    // Nav
    els.buttons.start.addEventListener('click', showStoryScreen);
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
        if (k === name) { s.classList.remove('hidden'); s.classList.add('active'); }
        else { s.classList.remove('active'); s.classList.add('hidden'); }
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
            isRunning: true, level: 1, enemiesDefeatedInLevel: 0, enemiesRequiredForNextLevel: 5,
            enemies: [], rescued: [], projectiles: [], powerups: [],
            player: { ...HERO_CLASSES[state.selectedClass] },
            heroPosition: { x: (worldRect.width||200)/2, y: (worldRect.height||300)/2 },
            heroTarget: { x: (worldRect.width||200)/2, y: (worldRect.height||300)/2 },
            combo: 0, lastComboHit: 0, comboMult: 1, activeBuffs: [],
            isDodging: false, dodgeCooldown: 0, lastDodgeTime: 0,
            abilityCooldown: 0, lastAbilityTime: 0, betweenWaves: false, waveTimer: 0
        });
        state.upgrades = {
            damage: { level:1, cost:10, baseCost:10, mult:1.5, costMult:1.5 },
            health: { level:1, cost:15, baseCost:15, mult:1.5, costMult:1.5 },
            speed:  { level:1, cost:20, baseCost:20, mult:0.9, costMult:1.8 }
        };
    } else {
        state.isRunning = true; state.enemies = []; state.projectiles = []; state.powerups = [];
    }

    els.world.innerHTML = '<div id="battleground-elements"></div><div id="damage-text-layer"></div>';
    els.textLayer = document.getElementById('damage-text-layer');
    els.buttons.abilityIcon.innerText = state.player.abilityIcon || '🌀';

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
    for (let i = 0; i < 15; i++) {
        const el = document.createElement('div');
        el.className = Math.random() > 0.5 ? 'bg-crater' : 'bg-scorch';
        el.style.left = `${Math.random()*(wr.width||300)}px`;
        el.style.top = `${Math.random()*(wr.height||400)}px`;
        el.style.transform = `translate(-50%,-50%) scale(${0.5+Math.random()}) rotate(${Math.random()*360}deg)`;
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
    const dt = Math.min(t - state.lastTick, 50); // Cap delta for tab-switch
    state.lastTick = t;

    moveHero(dt);
    handleAttack(t);
    updateProjectiles(dt);
    updateEnemies(t, dt);
    updatePowerups(dt);
    updateCombo(t);
    updateBuffs(t);
    updateCooldowns(t);

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

    requestAnimationFrame(gameLoop);
}

// ========== HERO ==========
function createHero() {
    if (state.heroElement) state.heroElement.remove();
    const hero = document.createElement('div');
    hero.className = 'entity hero';
    let emoji = state.player.emoji;
    const skin = MARKET_ITEMS.skins.find(s => s.id === state.equippedSkin);
    if (skin && skin.id !== 'skin_base') emoji = skin.emoji;
    hero.innerHTML = emoji;
    const aura = MARKET_ITEMS.auras.find(a => a.id === state.equippedAura);
    if (aura && aura.id !== 'aura_none') hero.classList.add(aura.class);
    els.world.appendChild(hero);
    state.heroElement = hero;
    updateHeroPos();
}

function updateHeroPos() {
    if (!state.heroElement) return;
    state.heroElement.style.left = `${state.heroPosition.x - 30}px`;
    state.heroElement.style.top = `${state.heroPosition.y - 30}px`;
}

function moveHero(dt) {
    if (!state.heroElement || state.isDodging) return;
    const worldRect = els.world.getBoundingClientRect();

    let dx = 0, dy = 0;
    // Joystick
    if (state.joystickActive) { dx = state.joystickDir.x; dy = state.joystickDir.y; }
    // Keyboard
    if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
    if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
    if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
    if (state.keys['d'] || state.keys['arrowright']) dx += 1;

    if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx*dx + dy*dy);
        const speed = state.player.speed * (dt / 16);
        state.heroPosition.x += (dx/len) * speed;
        state.heroPosition.y += (dy/len) * speed;
        // Clamp
        state.heroPosition.x = Math.max(20, Math.min(worldRect.width - 20, state.heroPosition.x));
        state.heroPosition.y = Math.max(20, Math.min(worldRect.height - 20, state.heroPosition.y));
        updateHeroPos();
        if (state.player.speed >= 3 && Math.random() < 0.15) createDashTrail(state.heroPosition.x, state.heroPosition.y);
    } else {
        // Click-to-move fallback
        const tdx = state.heroTarget.x - state.heroPosition.x;
        const tdy = state.heroTarget.y - state.heroPosition.y;
        const dist = Math.sqrt(tdx*tdx + tdy*tdy);
        if (dist > 5) {
            const moveDist = state.player.speed * (dt/16);
            const ratio = Math.min(moveDist/dist, 1);
            state.heroPosition.x += tdx * ratio;
            state.heroPosition.y += tdy * ratio;
            state.heroPosition.x = Math.max(20, Math.min(worldRect.width - 20, state.heroPosition.x));
            state.heroPosition.y = Math.max(20, Math.min(worldRect.height - 20, state.heroPosition.y));
            updateHeroPos();
        }
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
