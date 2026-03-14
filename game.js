// Game configuration
const ENEMY_EMOJIS = ['👿', '👹', '👺', '👻', '👽', '👾', '🤖', '🎃', '🦇', '🕷️', '🦂', '🧛'];
const BOSS_EMOJIS = ['🐉', '🦖', '🐙', '🦍', '🌋', '🌪️', '💀', '☠️', '👁️'];
const FINAL_BOSS_EMOJI = '👑😈👑'; // The ultimate boss

// Character Classes
const HERO_CLASSES = {
    balanced: {
        emoji: '😎',
        maxHp: 100, hp: 100, damage: 10, attackSpeed: 1000, critChance: 0.1, speed: 3
    },
    tank: {
        emoji: '🛡️',
        maxHp: 250, hp: 250, damage: 12, attackSpeed: 1500, critChance: 0.05, speed: 2
    },
    assassin: {
        emoji: '🥷',
        maxHp: 60, hp: 60, damage: 15, attackSpeed: 600, critChance: 0.3, speed: 4
    }
};

const RESCUED_POOL = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🐰', '🐢', '🦖', '🦄', '🐝', '🐙', '🐬', '🦀'];

const STORY_LINES = [
    "The Emoji Kingdom lived in harmony...",
    "Until the sinister forces of Darkness emerged.",
    "Corrupted emojis now ravage our lands.",
    "The ultimate evil, King Devil 👑😈👑, awaits at Level 100.",
    "Will you be the hero we need?"
];

// Game State
let state = {
    isRunning: false,
    level: 1,
    points: 0,
    enemiesDefeatedInLevel: 0,
    enemiesRequiredForNextLevel: 5,
    lastTick: 0,
    lastAttackTime: 0,
    player: { ...HERO_CLASSES['balanced'] }, // Default
    selectedClass: 'balanced',
    heroElement: null,
    heroPosition: { x: 50, y: 50 }, // Percentages
    heroTarget: { x: 50, y: 50 }, // For clicking to move
    enemies: [],
    rescued: [],
    upgrades: {
        damage: { level: 1, cost: 10, mult: 1.5, costMult: 1.5 },
        health: { level: 1, cost: 15, mult: 1.5, costMult: 1.5 },
        speed: { level: 1, cost: 20, mult: 0.9, costMult: 1.8 } // Reduces attack delay
    }
};

// PocketBase Setup
const pb = new PocketBase('https://pocketbase.bdpro.in');

// --- SOUND ENGINE ---
const SoundEngine = {
    ctx: null,
    
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    
    playTone(hz, type = 'sine', duration = 0.1, vol = 0.1) {
        if (!this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(hz, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    
    shoot() { this.playTone(800, 'square', 0.1, 0.05); },
    critShoot() { this.playTone(1200, 'square', 0.15, 0.08); },
    hit() { this.playTone(150, 'sawtooth', 0.2, 0.1); },
    coin() { 
        this.playTone(1200, 'sine', 0.1, 0.05); 
        setTimeout(() => this.playTone(1600, 'sine', 0.2, 0.05), 50);
    },
    levelUp() {
        [440, 554, 659, 880].forEach((hz, i) => {
            setTimeout(() => this.playTone(hz, 'sine', 0.3, 0.1), i * 100);
        });
    },
    upgrade() {
        this.playTone(600, 'triangle', 0.1, 0.1);
        setTimeout(() => this.playTone(900, 'triangle', 0.3, 0.1), 100);
    },
    gameOver() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 1.5);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 1.5);
    }
};

// DOM Elements
const els = {
    screens: {
        login: document.getElementById('login-screen'),
        register: document.getElementById('register-screen'),
        start: document.getElementById('start-screen'),
        story: document.getElementById('story-screen'),
        charSelect: document.getElementById('char-select-screen'),
        game: document.getElementById('game-ui'),
        end: document.getElementById('end-screen')
    },
    buttons: {
        login: document.getElementById('login-btn'),
        register: document.getElementById('register-btn'),
        goToRegister: document.getElementById('go-to-register'),
        goToLogin: document.getElementById('go-to-login'),
        start: document.getElementById('start-btn'),
        load: document.getElementById('load-btn'),
        save: document.getElementById('save-btn'),
        skipStory: document.getElementById('skip-btn'),
        restart: document.getElementById('restart-btn')
    },
    auth: {
        email: document.getElementById('login-email'),
        pass: document.getElementById('login-pass'),
        error: document.getElementById('login-error'),
        
        regEmail: document.getElementById('reg-email'),
        regPass: document.getElementById('reg-pass'),
        regPassConfirm: document.getElementById('reg-pass-confirm'),
        regError: document.getElementById('reg-error'),
        regSuccess: document.getElementById('reg-success')
    },
    storyText: document.getElementById('story-text'),
    charCards: document.querySelectorAll('.char-card'),
    hud: {
        healthBar: document.getElementById('health-bar'),
        healthText: document.getElementById('health-text'),
        levelDisplay: document.getElementById('level-display'),
        levelProgress: document.getElementById('level-progress'),
        pointsDisplay: document.getElementById('points-display'),
        rescuedContainer: document.getElementById('rescued-container')
    },
    world: document.getElementById('game-world'),
    textLayer: document.getElementById('damage-text-layer'),
    warning: document.getElementById('boss-warning'),
    saveToast: document.getElementById('save-toast'),
    upgrades: {
        dmgBtn: document.getElementById('upg-damage'),
        dmgCost: document.getElementById('cost-damage'),
        dmgLvl: document.getElementById('lvl-damage'),
        
        hpBtn: document.getElementById('upg-health'),
        hpCost: document.getElementById('cost-health'),
        hpLvl: document.getElementById('lvl-health'),
        
        spdBtn: document.getElementById('upg-speed'),
        spdCost: document.getElementById('cost-speed'),
        spdLvl: document.getElementById('lvl-speed'),
        
        healBtn: document.getElementById('btn-heal')
    }
};

// --- INITIALIZATION ---
function init() {
    bindEvents();
    
    // Check if already logged in via LocalStorage
    if (pb.authStore.isValid) {
        showStartScreen();
    }
}

function bindEvents() {
    els.buttons.login.addEventListener('click', handleLogin);
    els.buttons.register.addEventListener('click', handleRegistration);
    
    // Auth screen toggling
    els.buttons.goToRegister.addEventListener('click', () => {
        els.screens.login.classList.remove('active');
        els.screens.login.classList.add('hidden');
        els.screens.register.classList.remove('hidden');
        els.screens.register.classList.add('active');
        clearAuthErrors();
    });
    
    els.buttons.goToLogin.addEventListener('click', () => {
        els.screens.register.classList.remove('active');
        els.screens.register.classList.add('hidden');
        els.screens.login.classList.remove('hidden');
        els.screens.login.classList.add('active');
        clearAuthErrors();
    });

    els.buttons.start.addEventListener('click', showStoryScreen);
    els.buttons.load.addEventListener('click', loadGame);
    els.buttons.save.addEventListener('click', saveGame);
    els.buttons.skipStory.addEventListener('click', showCharSelectScreen);
    
    // Character Selection
    els.charCards.forEach(card => {
        card.addEventListener('click', () => {
            const heroType = card.getAttribute('data-hero');
            state.selectedClass = heroType;
            startGame();
        });
    });

    els.buttons.restart.addEventListener('click', resetGame);
    
    // Store buttons
    els.upgrades.dmgBtn.addEventListener('click', () => buyUpgrade('damage'));
    els.upgrades.hpBtn.addEventListener('click', () => buyUpgrade('health'));
    els.upgrades.spdBtn.addEventListener('click', () => buyUpgrade('speed'));
    els.upgrades.healBtn.addEventListener('click', () => {
        if (state.points >= 5) {
            state.points -= 5;
            healPlayer(state.player.maxHp * 0.5);
            updateUI();
        }
    });

    // World interaction (moving or clicking enemies handled separately)
    // Map both mouse down and touch start
    els.world.addEventListener('mousedown', handleWorldClick);
    els.world.addEventListener('touchstart', handleWorldTouch, { passive: false });
}

let typeWriterTimeout;

function clearAuthErrors() {
    els.auth.error.classList.add('hidden');
    els.auth.regError.classList.add('hidden');
    els.auth.regSuccess.classList.add('hidden');
}

async function handleLogin() {
    const email = els.auth.email.value;
    const pass = els.auth.pass.value;
    
    if(!email || !pass) return;
    
    els.buttons.login.innerText = "LOGGING IN...";
    els.buttons.login.disabled = true;
    
    try {
        const authData = await pb.collection('users').authWithPassword(email, pass);
        if (pb.authStore.isValid) {
            showStartScreen();
        }
    } catch (err) {
        console.error("Login failed:", err);
        els.auth.error.innerText = "Invalid credentials";
        els.auth.error.classList.remove('hidden');
        els.buttons.login.innerText = "LOGIN";
        els.buttons.login.disabled = false;
    }
}

async function handleRegistration() {
    const email = els.auth.regEmail.value;
    const pass = els.auth.regPass.value;
    const passConfirm = els.auth.regPassConfirm.value;
    
    clearAuthErrors();
    
    if(!email || !pass || !passConfirm) {
        els.auth.regError.innerText = "Please fill all fields";
        els.auth.regError.classList.remove('hidden');
        return;
    }
    
    if (pass !== passConfirm) {
        els.auth.regError.innerText = "Passwords do not match";
        els.auth.regError.classList.remove('hidden');
        return;
    }
    
    if (pass.length < 8) {
        els.auth.regError.innerText = "Password must be at least 8 characters";
        els.auth.regError.classList.remove('hidden');
        return;
    }

    els.buttons.register.innerText = "CREATING...";
    els.buttons.register.disabled = true;
    
    try {
        // Create user
        const data = {
            "email": email,
            "password": pass,
            "passwordConfirm": passConfirm
        };
        const record = await pb.collection('users').create(data);
        
        // Show success, auto login
        els.auth.regSuccess.classList.remove('hidden');
        
        // Login with new credentials
        await pb.collection('users').authWithPassword(email, pass);
        
        if (pb.authStore.isValid) {
            setTimeout(() => {
                els.screens.register.classList.remove('active');
                els.screens.register.classList.add('hidden');
                showStartScreen();
            }, 1000);
        }
        
    } catch (err) {
        console.error("Registration failed:", err);
        // Display PocketBase error message if available
        els.auth.regError.innerText = err.response?.message || "Failed to create account. Email may be taken.";
        els.auth.regError.classList.remove('hidden');
        els.buttons.register.innerText = "SIGN UP";
        els.buttons.register.disabled = false;
    }
}

function showStartScreen() {
    els.screens.login.classList.remove('active');
    els.screens.login.classList.add('hidden');
    els.screens.start.classList.remove('hidden');
    els.screens.start.classList.add('active');
}

function showStoryScreen() {
    els.screens.start.classList.remove('active');
    els.screens.start.classList.add('hidden');
    els.screens.story.classList.remove('hidden');
    els.screens.story.classList.add('active');
    
    els.storyText.innerHTML = '';
    let lineIndex = 0;
    let charIndex = 0;
    
    function typeWriter() {
        if (lineIndex < STORY_LINES.length) {
            if (charIndex < STORY_LINES[lineIndex].length) {
                els.storyText.innerHTML += STORY_LINES[lineIndex].charAt(charIndex);
                charIndex++;
                typeWriterTimeout = setTimeout(typeWriter, 40); // typing speed
            } else {
                els.storyText.innerHTML += '<br><br>';
                lineIndex++;
                charIndex = 0;
                typeWriterTimeout = setTimeout(typeWriter, 500); // delay between lines
            }
        } else {
            // Finished typing, change button text
            els.buttons.skipStory.innerText = "CHOOSE HERO";
        }
    }
    
    typeWriter();
}

function showCharSelectScreen() {
    clearTimeout(typeWriterTimeout);
    els.screens.story.classList.remove('active');
    els.screens.story.classList.add('hidden');
    
    els.screens.charSelect.classList.remove('hidden');
    els.screens.charSelect.classList.add('active');
}

function startGame(isLoading = false) {
    els.screens.charSelect.classList.remove('active');
    els.screens.charSelect.classList.add('hidden');
    els.screens.end.classList.remove('active');
    els.screens.end.classList.add('hidden');
    els.screens.start.classList.remove('active');
    els.screens.start.classList.add('hidden');
    
    els.screens.game.classList.remove('hidden');
    els.screens.game.classList.add('active');
    
    // Init Audio Context on first interaction
    SoundEngine.init();
    
    if (!isLoading) {
        // Fresh start
        Object.assign(state, {
            isRunning: true,
            level: 1,
            enemiesDefeatedInLevel: 0,
            enemiesRequiredForNextLevel: 5,
            enemies: [],
            rescued: [],
            player: { ...HERO_CLASSES[state.selectedClass] },
            heroPosition: { x: window.innerWidth * 0.1, y: window.innerHeight * 0.5 },
            heroTarget: { x: window.innerWidth * 0.1, y: window.innerHeight * 0.5 }
        });
        
        // Reset upgrades
        state.upgrades = {
            damage: { level: 1, cost: 10, mult: 1.5, costMult: 1.5 },
            health: { level: 1, cost: 15, mult: 1.5, costMult: 1.5 },
            speed: { level: 1, cost: 20, mult: 0.9, costMult: 1.8 }
        };
    } else {
        // Resuming game: just update loop state
        state.isRunning = true;
        state.enemies = []; // Clear existing enemies, wave spawner will handle it
    }
    
    els.world.innerHTML = '<div id="damage-text-layer"></div>';
    els.textLayer = document.getElementById('damage-text-layer');
    
    createHero();
    updateUI();
    updateRescuedUI();
    
    state.lastTick = performance.now();
    requestAnimationFrame(gameLoop);
}

// --- SAVE & LOAD PROGRESS ---
function saveGame() {
    els.buttons.save.innerText = "SAVING...";
    els.buttons.save.disabled = true;

    try {
        const saveData = {
            "level": state.level,
            "points": state.points,
            "heroClass": state.selectedClass,
            "upgrades": state.upgrades,
            "rescued": state.rescued
        };
        
        localStorage.setItem('emojiWarzSave', JSON.stringify(saveData));

        // Show toast
        els.saveToast.classList.remove('hidden');
        setTimeout(() => els.saveToast.classList.add('hidden'), 3000);
        SoundEngine.upgrade(); // Use a positive sound

    } catch (err) {
        console.error("Save failed:", err);
        alert("Failed to save game to local storage.");
    } finally {
        els.buttons.save.innerText = "💾 SAVE";
        els.buttons.save.disabled = false;
    }
}

function loadGame() {
    els.buttons.load.innerText = "LOADING...";
    els.buttons.load.disabled = true;
    const errorEl = document.getElementById('load-error');
    errorEl.classList.add('hidden');
    
    try {
        const saveString = localStorage.getItem('emojiWarzSave');
        
        if (!saveString) {
            errorEl.innerText = "No local save file found.";
            errorEl.classList.remove('hidden');
            els.buttons.load.innerText = "LOAD SAVE";
            els.buttons.load.disabled = false;
            return;
        }
        
        const save = JSON.parse(saveString);
        
        // Restore State
        state.level = save.level;
        state.points = save.points;
        state.selectedClass = save.heroClass;
        state.upgrades = save.upgrades;
        state.rescued = save.rescued || [];
        
        // Rebuild player stats based on base class + upgrades
        const baseClass = HERO_CLASSES[state.selectedClass];
        state.player = { ...baseClass };
        
        // Apply historical upgrades
        // Damage
        for(let i=1; i < state.upgrades.damage.level; i++) {
            state.player.damage = Math.floor(state.player.damage * state.upgrades.damage.mult);
        }
        // Health
        for(let i=1; i < state.upgrades.health.level; i++) {
            state.player.maxHp = Math.floor(state.player.maxHp * state.upgrades.health.mult);
        }
        state.player.hp = state.player.maxHp; // Heal to full on load
        // Speed
        for(let i=1; i < state.upgrades.speed.level; i++) {
            state.player.attackSpeed = Math.max(100, Math.floor(state.player.attackSpeed * state.upgrades.speed.mult));
        }

        els.buttons.load.innerText = "LOAD SAVE";
        els.buttons.load.disabled = false;
        
        startGame(true); // Jump straight to game
        
    } catch (err) {
        console.error("Load failed:", err);
        errorEl.innerText = "Error loading save.";
        errorEl.classList.remove('hidden');
        els.buttons.load.innerText = "LOAD SAVE";
        els.buttons.load.disabled = false;
    }
}

function resetGame() {
    state.points = 0; // Punish slightly for dying, reset everything
    // Reset upgrades
    for (let key in state.upgrades) {
        state.upgrades[key].level = 1;
        state.upgrades[key].cost = state.upgrades[key].costMult === 1.5 ? 10 : 20; // Rough reset
    }
    state.rescued = [];
    if (els.hud.rescuedContainer) els.hud.rescuedContainer.innerHTML = '';
    startGame();
}

// --- GAME LOOP ---
function gameLoop(currentTime) {
    if (!state.isRunning) return;
    
    const deltaTime = currentTime - state.lastTick;
    state.lastTick = currentTime;
    
    update(currentTime, deltaTime);
    
    requestAnimationFrame(gameLoop);
}

function update(time, dt) {
    // 1. Move Hero
    moveHero(dt);
    
    // 2. Spawn Enemies
    if (state.enemies.length === 0) {
        spawnWave();
    }
    
    // 3. Move Enemies towards Hero & Attack
    updateEnemies(time, dt);
    
    // 4. Hero Auto-Attack
    if (time - state.lastAttackTime >= state.player.attackSpeed) {
        autoAttack();
        state.lastAttackTime = time;
    }
}

// --- GAME LOGIC ---

function createHero() {
    if (state.heroElement) {
        state.heroElement.remove();
    }
    const hero = document.createElement('div');
    hero.className = 'entity hero';
    hero.innerHTML = state.player.emoji;
    els.world.appendChild(hero);
    state.heroElement = hero;
    updateHeroPos();
}

function updateHeroPos() {
    if (!state.heroElement) return;
    state.heroElement.style.left = `calc(${state.heroPosition.x}px - var(--hero-size) / 2)`;
    state.heroElement.style.top = `calc(${state.heroPosition.y}px - var(--hero-size) / 2)`;
}

function handleWorldClick(e) {
    if (!state.isRunning) return;
    
    // Prevent default to stop scrolling on mobile, but don't prevent if they click UI
    if(e.target === els.world || e.target.id === 'damage-text-layer') {
        const rect = els.world.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        state.heroTarget = { x, y };
    }
}

function handleWorldTouch(e) {
    if (!state.isRunning) return;
    
    // Prevent default to stop scrolling on mobile, but don't prevent if they click UI
    if(e.target === els.world || e.target.id === 'damage-text-layer') {
        e.preventDefault(); 
        const touch = e.touches[0];
        const rect = els.world.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        state.heroTarget = { x, y };
    }
}

function moveHero(dt) {
    if (!state.heroElement) return;
    
    // Move towards target
    const dx = state.heroTarget.x - state.heroPosition.x;
    const dy = state.heroTarget.y - state.heroPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 5) { // Threshold to stop jitter
        const moveDist = state.player.speed * (dt / 16); // Normalize to 60fps
        const ratio = Math.min(moveDist / distance, 1);
        
        state.heroPosition.x += dx * ratio;
        state.heroPosition.y += dy * ratio;
        updateHeroPos();
    }
}

function spawnWave() {
    if (state.enemies.length > 0) return;

    state.enemiesRequiredForNextLevel = 5 + Math.floor(state.level * 1.5);
    let enemiesToSpawn = 3 + Math.floor(state.level / 2);
    
    // Cap simultaneous enemies for performance
    if (enemiesToSpawn > 15) enemiesToSpawn = 15;

    const isBossLevel = state.level % 10 === 0;
    const isFinalBoss = state.level === 100;

    if (isBossLevel || isFinalBoss) {
        showBossWarning();
        enemiesToSpawn = 1; // Just the boss
    }

    const worldRect = els.world.getBoundingClientRect();

    for (let i = 0; i < enemiesToSpawn; i++) {
        // Spawn edges
        const side = Math.floor(Math.random() * 4);
        let x, y;
        
        switch(side) {
            case 0: x = Math.random() * worldRect.width; y = -50; break; // Top
            case 1: x = worldRect.width + 50; y = Math.random() * worldRect.height; break; // Right
            case 2: x = Math.random() * worldRect.width; y = worldRect.height + 50; break; // Bottom
            case 3: x = -50; y = Math.random() * worldRect.height; break; // Left
        }

        let isBoss = false;
        let isUltimateLevelBoss = false;
        let hpMult = 1;
        let scale = 1;
        let emoji = ENEMY_EMOJIS[Math.floor(Math.random() * ENEMY_EMOJIS.length)];
        
        if (isFinalBoss) {
            isUltimateLevelBoss = true;
            hpMult = 50 * state.level;
            emoji = FINAL_BOSS_EMOJI;
            x = worldRect.width / 2;
            y = 50; // Spawn near top center
        } else if (isBossLevel) {
            isBoss = true;
            hpMult = 10 * state.level;
            emoji = BOSS_EMOJIS[Math.floor(Math.random() * BOSS_EMOJIS.length)];
        }

        const maxHp = (20 + (state.level * 15)) * hpMult;
        
        createEnemy({
            id: Date.now() + i,
            x, y,
            maxHp: maxHp,
            hp: maxHp,
            speed: isBoss ? 0.5 : (isUltimateLevelBoss ? 0.8 : 1 + (state.level * 0.05)),
            damage: isBoss ? Math.floor(state.level * 2) : Math.max(1, Math.floor(state.level / 2)),
            emoji: emoji,
            isBoss,
            isFinalBoss: isUltimateLevelBoss,
            attackDelay: 1500,
            lastAttackTime: 0
        });
    }
}

function showBossWarning() {
    els.warning.classList.remove('hidden');
    els.warning.style.display = 'block';
    setTimeout(() => {
        els.warning.classList.add('hidden');
        els.warning.style.display = 'none';
    }, 2000);
}

function createEnemy(data) {
    const el = document.createElement('div');
    // We add an inline style for animation since we can't reliably trigger it without a small delay if classes are slapped on immediately, 
    // but the CSS class already has animation, we just need to ensure the element is freshly created.
    el.className = `entity enemy ${data.isBoss ? 'boss' : ''} ${data.isFinalBoss ? 'final-boss' : ''}`;
    el.style.animation = `spawnIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, ${data.isFinalBoss ? 'finalBossFloat' : (data.isBoss ? 'bossFloat' : 'enemyWobble')} ${data.isFinalBoss ? '4s' : (data.isBoss ? '3s' : '1s')} ease-in-out infinite`;
    el.innerHTML = data.emoji;
    
    // HP Bar
    const hpContainer = document.createElement('div');
    hpContainer.className = `enemy-hp-container ${data.isBoss || data.isFinalBoss ? 'boss-hp-container' : ''}`;
    
    const hpFill = document.createElement('div');
    hpFill.className = `enemy-hp-fill ${data.isBoss || data.isFinalBoss ? 'boss-hp-fill' : ''}`;
    
    hpContainer.appendChild(hpFill);
    el.appendChild(hpContainer);
    
    els.world.appendChild(el);
    
    const enemyObj = { ...data, element: el, hpFill: hpFill };
    
    // Click/Touch to attack manually (hybrid clicker mechanic)
    const attackHandler = (e) => {
        e.preventDefault(); // Prevent double firing on mobile
        e.stopPropagation(); // Don't move hero
        damageEnemy(enemyObj, state.player.damage);
        
        let clientX, clientY;
        if(e.type === 'touchstart') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        createFloatingText(clientX, clientY, state.player.damage, 'damage');
    };
    
    el.addEventListener('mousedown', attackHandler);
    el.addEventListener('touchstart', attackHandler, { passive: false });

    state.enemies.push(enemyObj);
    updateEnemyPos(enemyObj);
}

function updateEnemyPos(enemy) {
    if (enemy.isFinalBoss) {
        enemy.element.style.left = `calc(${enemy.x}px - 100px)`;
        enemy.element.style.top = `calc(${enemy.y}px - 100px)`;
    } else if (enemy.isBoss) {
        // Boss size is defined in CSS var(--boss-size)
        enemy.element.style.left = `calc(${enemy.x}px - 70px)`;
        enemy.element.style.top = `calc(${enemy.y}px - 70px)`;
    } else {
         enemy.element.style.left = `calc(${enemy.x}px - 30px)`;
         enemy.element.style.top = `calc(${enemy.y}px - 30px)`;
    }
}

function updateEnemies(time, dt) {
    // Only target active enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
        const enemy = state.enemies[i];
        if (enemy.hp <= 0) continue; // Skip dying ones

        const dx = state.heroPosition.x - enemy.x;
        const dy = state.heroPosition.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const attackRange = enemy.isFinalBoss ? 150 : (enemy.isBoss ? 100 : 50);

        if (distance > attackRange) {
            // Move towards hero
            const moveDist = enemy.speed * (dt / 16);
            enemy.x += (dx / distance) * moveDist;
            enemy.y += (dy / distance) * moveDist;
            updateEnemyPos(enemy);
        } else {
            // Attack Hero
            if (time - enemy.lastAttackTime > enemy.attackDelay) {
                damagePlayer(enemy.damage);
                enemy.lastAttackTime = time;
                
                // Enemy attack animation
                enemy.element.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    if (enemy.element) enemy.element.style.transform = '';
                }, 100);
            }
        }
    }
}

function autoAttack() {
    if (state.enemies.length === 0) return;

    // Find closest enemy
    let closestEnemy = null;
    let minDistance = Infinity;

    for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue; // Don't attack dying
        const dx = state.heroPosition.x - enemy.x;
        const dy = state.heroPosition.y - enemy.y;
        const distance = dx * dx + dy * dy;

        if (distance < minDistance) {
            minDistance = distance;
            closestEnemy = enemy;
        }
    }

    // Auto attack range: ~250px radius
    if (closestEnemy && minDistance < 62500) {
        let isCrit = Math.random() < state.player.critChance;
        let dmg = state.player.damage;
        if (isCrit) dmg = Math.floor(dmg * 2.5);

        damageEnemy(closestEnemy, dmg, isCrit);
        
        // Play Sound
        if (isCrit) SoundEngine.critShoot();
        else SoundEngine.shoot();
        
        // Attack Animation
        state.heroElement.classList.remove('attacking');
        void state.heroElement.offsetWidth; // Trigger reflow
        state.heroElement.classList.add('attacking');

        // Draw projectile/laser (visual only)
        createAttackLine(state.heroPosition.x, state.heroPosition.y, closestEnemy.x, closestEnemy.y, isCrit);
    }
}

function createAttackLine(x1, y1, x2, y2, isCrit) {
    const line = document.createElement('div');
    const length = Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
    const angle = Math.atan2(y2-y1, x2-x1) * 180 / Math.PI;

    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.width = `${length}px`;
    line.style.height = isCrit ? '6px' : '3px';
    line.style.background = isCrit ? 'linear-gradient(90deg, #fff, #ff00ff)' : 'linear-gradient(90deg, #fff, #00f0ff)';
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    line.style.boxShadow = isCrit ? '0 0 10px #ff00ff' : '0 0 10px #00f0ff';
    line.style.borderRadius = '5px';
    line.style.zIndex = '80';
    line.style.pointerEvents = 'none';
    line.style.opacity = '1';
    line.style.transition = 'opacity 0.2s ease-out';

    els.textLayer.appendChild(line);

    setTimeout(() => {
        line.style.opacity = '0';
        setTimeout(() => line.remove(), 200);
    }, 50);
}

function damageEnemy(enemy, amount, isCrit = false) {
    if (enemy.hp <= 0) return; // Already dead

    enemy.hp -= amount;
    
    SoundEngine.hit();
    
    // Update HP bar
    const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpFill.style.width = `${hpRatio * 100}%`;

    // Damage Text
    const rect = els.world.getBoundingClientRect();
    createFloatingText(enemy.x + rect.left, enemy.y + rect.top - 20, amount, isCrit ? 'crit' : 'damage');

    // Hit animation
    enemy.element.classList.remove('hit');
    void enemy.element.offsetWidth; // Reflow
    enemy.element.classList.add('hit');

    if (enemy.hp <= 0) {
        killEnemy(enemy);
    }
}

function killEnemy(enemy) {
    enemy.element.classList.add('dying');
    
    // Reward points
    let pointsEarned = 1 + Math.floor(state.level * 0.5);
    if (enemy.isBoss) pointsEarned *= 10;
    if (enemy.isFinalBoss) pointsEarned *= 100;

    state.points += pointsEarned;
    state.enemiesDefeatedInLevel++;

    SoundEngine.coin();

    // Show points
    const rect = els.world.getBoundingClientRect();
    createFloatingText(enemy.x + rect.left, enemy.y + rect.top, `+${pointsEarned}💎`, 'points');

    updateUI();

    // Check level progression
    if (enemy.isFinalBoss) {
        winGame();
    } else if (enemy.isBoss || state.enemiesDefeatedInLevel >= state.enemiesRequiredForNextLevel) {
        levelUp();
    }

    // Cleanup after animation
    setTimeout(() => {
        if (enemy.element && enemy.element.parentNode) {
            enemy.element.remove();
        }
        state.enemies = state.enemies.filter(e => e.id !== enemy.id);
    }, 400);
}

function levelUp() {
    state.level++;
    state.enemiesDefeatedInLevel = 0;
    
    // Auto heal a tiny bit on level up
    healPlayer(Math.floor(state.player.maxHp * 0.2));
    
    // Level up visual effect
    const rect = els.world.getBoundingClientRect();
    createFloatingText(state.heroPosition.x + rect.left, state.heroPosition.y + rect.top - 50, "LEVEL UP!", "points");
    
    // Check for Rescue
    if (state.level % 5 === 0) {
        const ally = RESCUED_POOL[Math.floor(Math.random() * RESCUED_POOL.length)];
        state.rescued.push(ally);
        
        setTimeout(() => {
            createFloatingText(state.heroPosition.x + rect.left, state.heroPosition.y + rect.top - 80, `Rescued ${ally}!`, "points");
            updateRescuedUI(true); // new ally animation
        }, 500); // slightly after level up text
        
        SoundEngine.coin(); // generic happy ping for rescue
    }
    
    SoundEngine.levelUp();
    
    updateUI();

    // Small delay before next wave or continue spawning immediately if more are needed
}

function damagePlayer(amount) {
    state.player.hp -= amount;
    
    // Screen shake / flash
    els.world.style.transform = `translate(${Math.random()*10 - 5}px, ${Math.random()*10 - 5}px)`;
    setTimeout(() => els.world.style.transform = 'none', 50);
    
    // Damage text
    const rect = els.world.getBoundingClientRect();
    createFloatingText(state.heroPosition.x + rect.left, state.heroPosition.y + rect.top - 20, `-${amount}`, 'crit'); // Use crit style for red

    if (state.player.hp <= 0) {
        state.player.hp = 0;
        gameOver();
    }
    updateUI();
}

function healPlayer(amount) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
    
    // Heal text
    const rect = els.world.getBoundingClientRect();
    createFloatingText(state.heroPosition.x + rect.left, state.heroPosition.y + rect.top - 20, `+${Math.floor(amount)}`, 'heal');
    
    updateUI();
}

function createFloatingText(x, y, text, type) {
    const el = document.createElement('div');
    el.className = `floating-text ${type}`;
    el.innerText = text;
    
    // Randomize initial position slightly
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = (Math.random() - 0.5) * 20;
    
    el.style.left = `${x + offsetX}px`;
    el.style.top = `${y + offsetY}px`;
    
    els.textLayer.appendChild(el);
    
    // Cleanup
    setTimeout(() => {
        if (el.parentNode) el.remove();
    }, 800);
}

// --- UPGRADES & STORE ---
function buyUpgrade(type) {
    const upg = state.upgrades[type];
    if (state.points >= upg.cost) {
        state.points -= upg.cost;
        
        upg.level++;
        upg.cost = Math.floor(upg.cost * upg.costMult);
        
        // Apply effect
        switch(type) {
            case 'damage':
                state.player.damage = Math.floor(state.player.damage * upg.mult);
                break;
            case 'health':
                const oldMax = state.player.maxHp;
                state.player.maxHp = Math.floor(state.player.maxHp * upg.mult);
                // Heal the difference
                state.player.hp += (state.player.maxHp - oldMax);
                break;
            case 'speed':
                state.player.attackSpeed = Math.max(100, Math.floor(state.player.attackSpeed * upg.mult)); // Cap at 100ms
                break;
        }
        
        SoundEngine.upgrade();
        
        updateUI();
    }
}

function updateRescuedUI(isNew = false) {
    if (!els.hud.rescuedContainer) return;
    els.hud.rescuedContainer.innerHTML = '';
    state.rescued.forEach((ally, i) => {
        const span = document.createElement('span');
        span.innerText = ally;
        // if this is the last one in the list and it's a new rescue, gently animate it
        if (isNew && i === state.rescued.length - 1) {
            span.className = 'new-ally';
        }
        els.hud.rescuedContainer.appendChild(span);
    });
}

// --- UI UPDATES ---
function updateUI() {
    // Top HUD
    els.hud.healthText.innerText = `${Math.floor(state.player.hp)}/${Math.floor(state.player.maxHp)}`;
    els.hud.healthBar.style.width = `${(state.player.hp / state.player.maxHp) * 100}%`;
    
    els.hud.levelDisplay.innerText = state.level;
    const progress = state.level % 10 === 0 ? 100 : (state.enemiesDefeatedInLevel / state.enemiesRequiredForNextLevel) * 100;
    els.hud.levelProgress.style.width = `${Math.min(100, progress)}%`;
    
    els.hud.pointsDisplay.innerText = state.points;
    
    // Store Buttons Configuration
    const updateBtn = (btn, upg, costEl, lvlEl) => {
        costEl.innerText = upg.cost;
        lvlEl.innerText = `Lv.${upg.level}`;
        if (state.points >= upg.cost) {
            btn.disabled = false;
        } else {
            btn.disabled = true;
        }
    };
    
    updateBtn(els.upgrades.dmgBtn, state.upgrades.damage, els.upgrades.dmgCost, els.upgrades.dmgLvl);
    updateBtn(els.upgrades.hpBtn, state.upgrades.health, els.upgrades.hpCost, els.upgrades.hpLvl);
    updateBtn(els.upgrades.spdBtn, state.upgrades.speed, els.upgrades.spdCost, els.upgrades.spdLvl);
    
    els.upgrades.healBtn.disabled = state.points < 5 || state.player.hp >= state.player.maxHp;
}

// --- END GAME CONDITIONS ---
function gameOver() {
    state.isRunning = false;
    
    SoundEngine.gameOver();
    
    // Play dramatic death animation on hero
    if (state.heroElement) {
        state.heroElement.classList.add('dying');
    }
    
    // Wait for death animation to mostly finish before showing screen
    setTimeout(() => {
        els.screens.game.classList.remove('active');
        els.screens.game.classList.add('hidden');
        
        // Reset specific game over UI styles (incase winGame changed them)
        const titleEl = document.getElementById('end-title');
        titleEl.innerText = "GAME OVER";
        titleEl.classList.add('game-over-text');
        
        document.getElementById('death-skull').style.display = 'block';
        document.getElementById('final-level').innerText = state.level;
        
        els.screens.end.classList.add('blood-tint');
        els.screens.end.classList.remove('hidden');
        els.screens.end.classList.add('active');
    }, 1200);
}

function winGame() {
    state.isRunning = false;
    els.screens.game.classList.remove('active');
    els.screens.game.classList.add('hidden');
    
    const titleEl = document.getElementById('end-title');
    titleEl.innerText = "VICTORY!";
    titleEl.classList.remove('game-over-text'); // Remove red styles
    titleEl.style.color = "#00ff88"; // Success green text
    titleEl.style.textShadow = "0 0 20px #00ff88";
    titleEl.style.webkitTextFillColor = "#00ff88"; // override webkit 
    
    document.getElementById('death-skull').style.display = 'none';
    document.getElementById('end-subtitle').innerText = "You defeated the Level 100 Boss!";
    
    els.screens.end.classList.remove('blood-tint');
    els.screens.end.classList.remove('hidden');
    els.screens.end.classList.add('active');
}

// Initialize on load
window.addEventListener('load', init);
