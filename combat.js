// ========== combat.js — Combat, Enemies, Abilities, Power-ups, UI ==========

// ========== DODGE ==========
function performDodge() {
    if (!state.isRunning || state.isDodging) return;
    const now = performance.now();
    if (now - state.lastDodgeTime < 1500) return; // 1.5s cooldown

    state.isDodging = true;
    state.lastDodgeTime = now;
    SFX.dodge();

    // Dash direction
    let dx = state.joystickDir.x, dy = state.joystickDir.y;
    if (state.keys['w'] || state.keys['arrowup']) dy = -1;
    if (state.keys['s'] || state.keys['arrowdown']) dy = 1;
    if (state.keys['a'] || state.keys['arrowleft']) dx = -1;
    if (state.keys['d'] || state.keys['arrowright']) dx = 1;
    if (dx === 0 && dy === 0) dx = 1; // Default right

    const len = Math.sqrt(dx*dx + dy*dy);
    const dashDist = 120;
    const worldRect = els.world.getBoundingClientRect();

    // Ghost trails during dash
    for (let i = 0; i < 4; i++) {
        setTimeout(() => createDashTrail(state.heroPosition.x, state.heroPosition.y), i * 50);
    }

    state.heroPosition.x += (dx/len) * dashDist;
    state.heroPosition.y += (dy/len) * dashDist;
    state.heroPosition.x = Math.max(20, Math.min(worldRect.width - 20, state.heroPosition.x));
    state.heroPosition.y = Math.max(20, Math.min(worldRect.height - 20, state.heroPosition.y));
    state.heroTarget = { ...state.heroPosition };
    updateHeroPos();

    if (state.heroElement) state.heroElement.classList.add('invincible');

    // Cooldown overlay
    els.buttons.dodgeCD.style.setProperty('--cd-duration', '1.5s');
    els.buttons.dodgeCD.classList.remove('active');
    void els.buttons.dodgeCD.offsetWidth;
    els.buttons.dodgeCD.classList.add('active');

    setTimeout(() => {
        state.isDodging = false;
        if (state.heroElement) state.heroElement.classList.remove('invincible');
    }, 300);
}

// ========== ABILITIES ==========
function performAbility() {
    if (!state.isRunning) return;
    const now = performance.now();
    const cd = state.player.abilityCD || 8000;
    if (now - state.lastAbilityTime < cd) return;

    state.lastAbilityTime = now;
    SFX.ability();

    // Cooldown overlay
    els.buttons.abilityCD.style.setProperty('--cd-duration', `${cd/1000}s`);
    els.buttons.abilityCD.classList.remove('active');
    void els.buttons.abilityCD.offsetWidth;
    els.buttons.abilityCD.classList.add('active');

    const px = state.heroPosition.x, py = state.heroPosition.y;

    switch (state.selectedClass) {
        case 'balanced': // Whirlwind AoE
            createAoE(px, py, 150, '#ff6600', state.player.damage * 3);
            createFloatingText(px, py - 30, '🌀 WHIRLWIND!', 'points');
            triggerScreenShake('heavy');
            break;

        case 'tank': // Fortify Shield
            addBuff('shield', '🛡️', 3000);
            createFloatingText(px, py - 30, '🛡️ FORTIFY!', 'heal');
            createAoE(px, py, 80, '#00ff88', 0); // Visual only
            break;

        case 'assassin': // Shadow Strike — teleport to nearest + big crit
            const target = findClosestEnemy();
            if (target) {
                state.heroPosition.x = target.x;
                state.heroPosition.y = target.y;
                state.heroTarget = { ...state.heroPosition };
                updateHeroPos();
                for (let i = 0; i < 3; i++) createDashTrail(px + (target.x-px)*i/3, py + (target.y-py)*i/3);
                damageEnemy(target, state.player.damage * 5, true);
                createFloatingText(target.x, target.y - 30, '👤 SHADOW STRIKE!', 'crit');
            }
            triggerScreenShake('heavy');
            break;

        case 'mage': // Meteor AoE
            const mt = findClosestEnemy();
            const mx = mt ? mt.x : px + 100, my = mt ? mt.y : py;
            createAoE(mx, my, 200, '#ff0000', state.player.damage * 4);
            createFloatingText(mx, my - 30, '☄️ METEOR!', 'crit');
            triggerScreenShake('heavy');
            // Screen flash
            const flash = document.createElement('div');
            flash.className = 'screen-flash';
            els.world.appendChild(flash);
            setTimeout(() => { if (flash.parentNode) flash.remove(); }, 300);
            break;

        case 'archer': // Arrow Rain
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    const rx = px + (Math.random()-0.5) * 300, ry = py + (Math.random()-0.5) * 200;
                    fireProjectile(px, py, rx, ry, state.player.damage * 1.5);
                }, i * 80);
            }
            createFloatingText(px, py - 30, '🌧️ ARROW RAIN!', 'points');
            break;
    }
}

function createAoE(x, y, radius, color, damage) {
    const aoe = document.createElement('div');
    aoe.className = 'aoe-effect';
    aoe.style.left = `${x}px`; aoe.style.top = `${y}px`;
    aoe.style.width = `${radius*2}px`; aoe.style.height = `${radius*2}px`;
    aoe.style.borderColor = color;
    aoe.style.boxShadow = `0 0 30px ${color}, inset 0 0 20px ${color}`;
    els.world.appendChild(aoe);
    setTimeout(() => { if (aoe.parentNode) aoe.remove(); }, 400);

    if (damage > 0) {
        state.enemies.forEach(e => {
            if (e.hp <= 0) return;
            const dx = e.x - x, dy = e.y - y;
            if (Math.sqrt(dx*dx + dy*dy) < radius) damageEnemy(e, damage, true);
        });
    }
}

function findClosestEnemy() {
    let closest = null, minDist = Infinity;
    for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const dx = state.heroPosition.x - e.x, dy = state.heroPosition.y - e.y;
        const d = dx*dx + dy*dy;
        if (d < minDist) { minDist = d; closest = e; }
    }
    return closest;
}

// ========== ATTACK SYSTEM ==========
function handleAttack(time) {
    if (!state.attackHeld) return;
    if (time - state.lastManualAttack < state.player.attackSpeed) return;
    state.lastManualAttack = time;

    const target = findClosestEnemy();
    if (!target) return;

    const dx = state.heroPosition.x - target.x, dy = state.heroPosition.y - target.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist > state.player.range * 1.2) return; // Out of range

    let isCrit = Math.random() < state.player.critChance;
    let dmg = state.player.damage;
    // Check damage buff
    if (state.activeBuffs.find(b => b.type === 'damage_boost')) dmg = Math.floor(dmg * 1.5);
    if (isCrit) dmg = Math.floor(dmg * 2.5);
    // Combo multiplier
    dmg = Math.floor(dmg * state.comboMult);

    // Ranged: fire projectile
    if (state.player.projEmoji) {
        fireProjectile(state.heroPosition.x, state.heroPosition.y, target.x, target.y, dmg, isCrit);
        if (isCrit) SFX.crit(); else SFX.shoot();
    } else {
        // Melee: direct hit
        damageEnemy(target, dmg, isCrit);
        createImpactSlash(target.x, target.y, isCrit);
        if (isCrit) SFX.crit(); else SFX.shoot();
    }

    // Hero attack animation
    if (state.heroElement) {
        state.heroElement.classList.remove('attacking');
        void state.heroElement.offsetWidth;
        state.heroElement.classList.add('attacking');
    }
}

// Also auto-attack when not pressing (slower rate)
function autoAttackTick(time) {
    if (state.attackHeld) return; // Manual takes priority
    if (time - state.lastAttackTime < state.player.attackSpeed * 1.5) return; // Slower auto
    state.lastAttackTime = time;

    const target = findClosestEnemy();
    if (!target) return;

    const dx = state.heroPosition.x - target.x, dy = state.heroPosition.y - target.y;
    if (dx*dx + dy*dy > state.player.range * state.player.range) return;

    let isCrit = Math.random() < state.player.critChance * 0.5; // Lower crit on auto
    let dmg = state.player.damage;
    if (state.activeBuffs.find(b => b.type === 'damage_boost')) dmg = Math.floor(dmg * 1.5);
    if (isCrit) dmg = Math.floor(dmg * 2.5);

    if (state.player.projEmoji) {
        fireProjectile(state.heroPosition.x, state.heroPosition.y, target.x, target.y, dmg, isCrit);
    } else {
        damageEnemy(target, dmg, isCrit);
        createImpactSlash(target.x, target.y, isCrit);
    }
    if (isCrit) SFX.crit(); else SFX.shoot();
}

// ========== PROJECTILES ==========
function fireProjectile(fromX, fromY, toX, toY, damage, isCrit = false) {
    const el = document.createElement('div');
    el.className = 'projectile';
    el.innerText = state.player.projEmoji || '🔥';
    el.style.left = `${fromX}px`; el.style.top = `${fromY}px`;
    els.world.appendChild(el);

    const dx = toX - fromX, dy = toY - fromY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const speed = 8;
    const vx = (dx/dist) * speed, vy = (dy/dist) * speed;

    state.projectiles.push({ el, x: fromX, y: fromY, vx, vy, damage, isCrit, life: 600 });
}

function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        p.x += p.vx * (dt/16); p.y += p.vy * (dt/16);
        p.life -= dt;
        p.el.style.left = `${p.x}px`; p.el.style.top = `${p.y}px`;

        // Check collision with enemies
        let hit = false;
        for (const e of state.enemies) {
            if (e.hp <= 0) continue;
            const dx = p.x - e.x, dy = p.y - e.y;
            const hitDist = e.isBoss ? 60 : (e.isFinalBoss ? 80 : 30);
            if (dx*dx + dy*dy < hitDist*hitDist) {
                damageEnemy(e, p.damage, p.isCrit);
                createImpactSlash(e.x, e.y, p.isCrit);
                hit = true; break;
            }
        }

        if (hit || p.life <= 0) {
            if (p.el.parentNode) p.el.remove();
            state.projectiles.splice(i, 1);
        }
    }
}

// ========== ENEMIES ==========
function spawnWave() {
    state.enemiesRequiredForNextLevel = 5 + Math.floor(state.level * 1.5);
    let count = 3 + Math.floor(state.level / 2);
    if (count > 12) count = 12;

    const isBossLevel = state.level % 10 === 0;
    const isFinalBoss = state.level === 100;
    const isEliteLevel = state.level % 3 === 0 && !isBossLevel;

    if (isBossLevel || isFinalBoss) {
        showBossWarning(); count = 1;
        setTimeout(() => {
            const crack = document.createElement('div');
            crack.className = 'ground-crack'; crack.style.left = '50%'; crack.style.top = '150px';
            els.world.appendChild(crack);
            setTimeout(() => { if (crack.parentNode) crack.remove(); }, 3000);
            triggerScreenShake('heavy');
        }, 800);
    }

    const worldRect = els.world.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        switch(side) {
            case 0: x = Math.random() * worldRect.width; y = -40; break;
            case 1: x = worldRect.width + 40; y = Math.random() * worldRect.height; break;
            case 2: x = Math.random() * worldRect.width; y = worldRect.height + 40; break;
            case 3: x = -40; y = Math.random() * worldRect.height; break;
        }

        let isBoss = false, isUltimate = false, isElite = false, hpMult = 1;
        let emoji = ENEMY_EMOJIS[Math.floor(Math.random() * ENEMY_EMOJIS.length)];

        if (isFinalBoss) {
            isUltimate = true; hpMult = 50 * state.level; emoji = FINAL_BOSS_EMOJI;
            x = worldRect.width / 2; y = 50;
        } else if (isBossLevel) {
            isBoss = true; hpMult = 10 * state.level;
            emoji = BOSS_EMOJIS[Math.floor(Math.random() * BOSS_EMOJIS.length)];
        } else if (isEliteLevel && i === 0) {
            isElite = true; hpMult = 3; emoji = '⭐' + emoji;
        }

        const maxHp = (20 + state.level * 15) * hpMult;
        createEnemy({
            id: Date.now() + i, x, y, maxHp, hp: maxHp,
            speed: isBoss ? 0.5 : (isUltimate ? 0.8 : isElite ? 1.5 : 1 + state.level * 0.04),
            damage: isBoss ? Math.floor(state.level * 2) : isElite ? Math.floor(state.level * 0.8) : Math.max(1, Math.floor(state.level / 2)),
            emoji, isBoss, isFinalBoss: isUltimate, isElite,
            attackDelay: isBoss ? 1200 : 1500, lastAttackTime: 0
        });
    }
}

function showBossWarning() {
    els.warning.classList.remove('hidden'); els.warning.style.display = 'block';
    setTimeout(() => { els.warning.classList.add('hidden'); els.warning.style.display = 'none'; }, 2000);
}

function createEnemy(data) {
    const el = document.createElement('div');
    el.className = `entity enemy ${data.isBoss ? 'boss' : ''} ${data.isFinalBoss ? 'final-boss' : ''} ${data.isElite ? 'elite' : ''}`;
    el.innerHTML = data.emoji;

    const hpC = document.createElement('div');
    hpC.className = `enemy-hp-container ${data.isBoss || data.isFinalBoss ? 'boss-hp-container' : ''}`;
    const hpF = document.createElement('div');
    hpF.className = `enemy-hp-fill ${data.isBoss || data.isFinalBoss ? 'boss-hp-fill' : ''}`;
    hpC.appendChild(hpF); el.appendChild(hpC);
    els.world.appendChild(el);

    const obj = { ...data, element: el, hpFill: hpF };

    // Tap to attack enemy
    const handler = e => {
        e.preventDefault(); e.stopPropagation();
        if (obj.hp <= 0) return;
        let dmg = state.player.damage;
        let isCrit = Math.random() < state.player.critChance;
        if (state.activeBuffs.find(b => b.type === 'damage_boost')) dmg = Math.floor(dmg * 1.5);
        if (isCrit) dmg = Math.floor(dmg * 2.5);
        dmg = Math.floor(dmg * state.comboMult);
        damageEnemy(obj, dmg, isCrit);
        createImpactSlash(obj.x, obj.y, isCrit);
        if (isCrit) SFX.crit(); else SFX.shoot();
        if (state.heroElement) { state.heroElement.classList.remove('attacking'); void state.heroElement.offsetWidth; state.heroElement.classList.add('attacking'); }
    };
    el.addEventListener('mousedown', handler);
    el.addEventListener('touchstart', handler, { passive: false });

    state.enemies.push(obj);
    updateEnemyPos(obj);
}

function updateEnemyPos(e) {
    const offset = e.isFinalBoss ? 60 : (e.isBoss ? 50 : 22);
    e.element.style.left = `${e.x - offset}px`;
    e.element.style.top = `${e.y - offset}px`;
}

function updateEnemies(time, dt) {
    for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;

        const dx = state.heroPosition.x - e.x, dy = state.heroPosition.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const atkRange = e.isFinalBoss ? 100 : (e.isBoss ? 80 : 40);

        if (dist > atkRange) {
            const mv = e.speed * (dt/16);
            e.x += (dx/dist) * mv; e.y += (dy/dist) * mv;
            updateEnemyPos(e);
        } else {
            if (time - e.lastAttackTime > e.attackDelay) {
                if (!state.isDodging) {
                    // Check shield buff
                    const shieldBuff = state.activeBuffs.findIndex(b => b.type === 'shield_hit');
                    if (shieldBuff >= 0) {
                        state.activeBuffs.splice(shieldBuff, 1);
                        updateBuffsUI();
                        createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, '🛡️ BLOCKED!', 'heal');
                    } else {
                        damagePlayer(e.damage);
                    }
                }
                e.lastAttackTime = time;
                e.element.style.transform = 'scale(1.15)';
                setTimeout(() => { if (e.element) e.element.style.transform = ''; }, 100);
            }
        }
    }

    // Auto attack tick
    autoAttackTick(time);
}

// ========== DAMAGE SYSTEM ==========
function damageEnemy(enemy, amount, isCrit = false) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount;
    SFX.hit();

    enemy.hpFill.style.width = `${Math.max(0, enemy.hp/enemy.maxHp)*100}%`;
    createFloatingText(enemy.x, enemy.y - 15, amount, isCrit ? 'crit' : 'damage');

    // Knockback
    const dx = enemy.x - state.heroPosition.x, dy = enemy.y - state.heroPosition.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 0) {
        const kb = isCrit ? 30 : 12;
        enemy.x += (dx/dist) * kb; enemy.y += (dy/dist) * kb;
        updateEnemyPos(enemy);
    }

    triggerScreenShake(isCrit ? 'heavy' : 'light');
    enemy.element.classList.remove('hit'); void enemy.element.offsetWidth; enemy.element.classList.add('hit');

    // Combo
    state.combo++;
    state.lastComboHit = performance.now();
    if (state.combo >= 20) state.comboMult = 2;
    else if (state.combo >= 10) state.comboMult = 1.5;
    else if (state.combo >= 5) state.comboMult = 1.2;
    else state.comboMult = 1;
    updateComboUI();

    if (enemy.hp <= 0) killEnemy(enemy);
}

function killEnemy(enemy) {
    enemy.element.classList.add('dying');
    createBloodSplatter(enemy.x, enemy.y);

    let pts = 1 + Math.floor(state.level * 0.5);
    if (enemy.isBoss) pts *= 10;
    if (enemy.isFinalBoss) pts *= 100;
    if (enemy.isElite) pts *= 3;

    state.points += pts;
    state.totalLifetimePoints += pts;
    state.enemiesDefeatedInLevel++;
    SFX.coin();
    createFloatingText(enemy.x, enemy.y, `+${pts}💎`, 'points');

    // Power-up drop
    if (Math.random() < 0.15 || enemy.isBoss || enemy.isElite) spawnPowerup(enemy.x, enemy.y);

    updateUI();

    if (enemy.isFinalBoss) {
        els.world.classList.add('arena-flash');
        setTimeout(() => els.world.classList.remove('arena-flash'), 300);
        winGame();
    } else if (enemy.isBoss) {
        els.world.classList.add('arena-flash');
        setTimeout(() => els.world.classList.remove('arena-flash'), 300);
        triggerScreenShake('heavy');
        levelUp();
    } else if (state.enemiesDefeatedInLevel >= state.enemiesRequiredForNextLevel) {
        levelUp();
    }

    setTimeout(() => {
        if (enemy.element?.parentNode) enemy.element.remove();
        state.enemies = state.enemies.filter(e => e.id !== enemy.id);
    }, 400);
}

function createBloodSplatter(x, y) {
    for (let i = 0; i < 10; i++) {
        const p = document.createElement('div');
        p.style.cssText = `position:absolute;width:${3+Math.random()*6}px;height:${3+Math.random()*6}px;background:#880000;border-radius:50%;left:${x}px;top:${y}px;pointer-events:none;z-index:40;transition:transform 0.4s cubic-bezier(0.1,0.8,0.3,1),opacity 0.5s ease-in 0.3s`;
        if (els.textLayer) els.textLayer.appendChild(p);
        const a = Math.random()*Math.PI*2, d = 20+Math.random()*50;
        requestAnimationFrame(() => { p.style.transform = `translate(${Math.cos(a)*d}px,${Math.sin(a)*d}px)`; p.style.opacity = '0'; });
        setTimeout(() => { if (p.parentNode) p.remove(); }, 800);
    }
}

function damagePlayer(amount) {
    // Fortify shield buff reduces damage
    if (state.activeBuffs.find(b => b.type === 'fortify')) amount = Math.floor(amount * 0.3);

    state.player.hp -= amount;
    els.world.style.transform = `translate(${Math.random()*8-4}px,${Math.random()*8-4}px)`;
    setTimeout(() => els.world.style.transform = 'none', 50);
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 15, `-${amount}`, 'crit');
    if (state.player.hp <= 0) { state.player.hp = 0; gameOver(); }
    updateUI();
}

function healPlayer(amount) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 15, `+${Math.floor(amount)}`, 'heal');
    updateUI();
}

function levelUp() {
    state.level++; state.enemiesDefeatedInLevel = 0;
    healPlayer(Math.floor(state.player.maxHp * 0.2));
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 40, "LEVEL UP!", "points");

    if (state.level % 5 === 0) {
        const ally = RESCUED_POOL[Math.floor(Math.random() * RESCUED_POOL.length)];
        state.rescued.push(ally);
        setTimeout(() => { createFloatingText(state.heroPosition.x, state.heroPosition.y - 60, `Rescued ${ally}!`, "points"); updateRescuedUI(true); }, 500);
        SFX.coin();
    }
    SFX.levelUp();
    updateUI();
}

// ========== POWER-UPS ==========
function spawnPowerup(x, y) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const el = document.createElement('div');
    el.className = 'powerup'; el.innerText = type.emoji;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    els.world.appendChild(el);
    state.powerups.push({ el, x, y, type: type.type, label: type.label, life: 10000 });
}

function updatePowerups(dt) {
    for (let i = state.powerups.length - 1; i >= 0; i--) {
        const p = state.powerups[i];
        p.life -= dt;

        // Check pickup
        const dx = state.heroPosition.x - p.x, dy = state.heroPosition.y - p.y;
        if (dx*dx + dy*dy < 50*50) {
            pickupPowerup(p); p.el.remove(); state.powerups.splice(i, 1); continue;
        }

        if (p.life <= 0) {
            p.el.classList.add('despawning');
            setTimeout(() => { if (p.el.parentNode) p.el.remove(); }, 300);
            state.powerups.splice(i, 1);
        }
    }
}

function pickupPowerup(p) {
    SFX.pickup();
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 30, p.label, 'heal');

    switch (p.type) {
        case 'health': healPlayer(state.player.maxHp * 0.3); break;
        case 'speed': addBuff('speed_boost', '⚡', 5000); break;
        case 'damage': addBuff('damage_boost', '💪', 5000); break;
        case 'shield': addBuff('shield_hit', '🛡️', 15000); break;
    }
}

// ========== BUFFS ==========
function addBuff(type, icon, duration) {
    // Remove existing same buff
    state.activeBuffs = state.activeBuffs.filter(b => b.type !== type);
    state.activeBuffs.push({ type, icon, endTime: performance.now() + duration });

    if (type === 'speed_boost') state.player.speed *= 1.5;
    if (type === 'fortify') { /* damage reduction handled in damagePlayer */ }

    updateBuffsUI();
}

function updateBuffs(time) {
    let changed = false;
    for (let i = state.activeBuffs.length - 1; i >= 0; i--) {
        if (time >= state.activeBuffs[i].endTime) {
            const b = state.activeBuffs[i];
            if (b.type === 'speed_boost') state.player.speed = HERO_CLASSES[state.selectedClass].speed;
            state.activeBuffs.splice(i, 1);
            changed = true;
        }
    }
    if (changed) updateBuffsUI();
}

function updateBuffsUI() {
    els.buffs.innerHTML = '';
    state.activeBuffs.forEach(b => {
        const span = document.createElement('span');
        span.className = 'buff-icon'; span.innerText = b.icon;
        els.buffs.appendChild(span);
    });
}

// ========== COMBO ==========
function updateCombo(time) {
    if (state.combo > 0 && time - state.lastComboHit > 3000) {
        state.combo = 0; state.comboMult = 1; updateComboUI();
    }
}

function updateComboUI() {
    if (state.combo >= 3) {
        els.combo.display.classList.remove('hidden');
        els.combo.count.innerText = state.combo;
        els.combo.mult.innerText = `x${state.comboMult}`;
    } else {
        els.combo.display.classList.add('hidden');
    }
}

function updateCooldowns(time) {
    // Visual feedback is handled by CSS animations on the overlay
}

// ========== VISUAL FX ==========
function createFloatingText(x, y, text, type) {
    const el = document.createElement('div');
    el.className = `floating-text ${type}`; el.innerText = text;
    el.style.left = `${x + (Math.random()-0.5)*30}px`;
    el.style.top = `${y + (Math.random()-0.5)*15}px`;
    els.textLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 800);
}

function createImpactSlash(x, y, isCrit) {
    for (let i = 0; i < (isCrit ? 3 : 1); i++) {
        const s = document.createElement('div');
        s.className = 'slash-effect'; s.style.left = `${x}px`; s.style.top = `${y}px`;
        s.style.setProperty('--rot', `${Math.random()*360}deg`);
        els.textLayer.appendChild(s);
        setTimeout(() => { if (s.parentNode) s.remove(); }, 200);
    }
}

function triggerScreenShake(type = 'light') {
    els.world.classList.remove('shake-light', 'shake-heavy');
    void els.world.offsetWidth;
    els.world.classList.add(`shake-${type}`);
}

// ========== UPGRADES ==========
function buyUpgrade(type) {
    const upg = state.upgrades[type];
    if (state.points < upg.cost) return;
    state.points -= upg.cost;
    upg.level++; upg.cost = Math.floor(upg.cost * upg.costMult);

    switch(type) {
        case 'damage': state.player.damage = Math.floor(state.player.damage * upg.mult); break;
        case 'health':
            const old = state.player.maxHp;
            state.player.maxHp = Math.floor(state.player.maxHp * upg.mult);
            state.player.hp += (state.player.maxHp - old);
            break;
        case 'speed': state.player.attackSpeed = Math.max(100, Math.floor(state.player.attackSpeed * upg.mult)); break;
    }
    SFX.upgrade();
    updateUI();
}

// ========== UI UPDATES ==========
function updateHealthUI() {
    els.hud.healthText.innerText = `${Math.floor(state.player.hp)}/${Math.floor(state.player.maxHp)}`;
    if (els.hud.healthBar) els.hud.healthBar.style.width = `${(state.player.hp/state.player.maxHp)*100}%`;
}

function updateUI() {
    updateHealthUI();
    els.hud.levelDisplay.innerText = state.level;
    const prog = state.level % 10 === 0 ? 100 : (state.enemiesDefeatedInLevel/state.enemiesRequiredForNextLevel)*100;
    els.hud.levelProgress.style.width = `${Math.min(100, prog)}%`;

    if (els.hud.pointsDisplay.innerText !== String(state.points)) {
        els.hud.pointsDisplay.innerText = state.points;
        els.hud.pointsDisplay.classList.remove('collected');
        void els.hud.pointsDisplay.offsetWidth;
        els.hud.pointsDisplay.classList.add('collected');
    }

    const updBtn = (btn, upg, costEl, lvlEl) => {
        costEl.innerText = upg.cost; lvlEl.innerText = `Lv.${upg.level}`;
        btn.disabled = state.points < upg.cost;
    };
    updBtn(els.upgrades.dmgBtn, state.upgrades.damage, els.upgrades.dmgCost, els.upgrades.dmgLvl);
    updBtn(els.upgrades.hpBtn, state.upgrades.health, els.upgrades.hpCost, els.upgrades.hpLvl);
    updBtn(els.upgrades.spdBtn, state.upgrades.speed, els.upgrades.spdCost, els.upgrades.spdLvl);
    els.upgrades.healBtn.disabled = state.points < 5 || state.player.hp >= state.player.maxHp;
}

function updateRescuedUI(isNew = false) {
    if (!els.hud.rescuedContainer) return;
    els.hud.rescuedContainer.innerHTML = '';
    state.rescued.forEach((ally, i) => {
        const span = document.createElement('span'); span.innerText = ally;
        if (isNew && i === state.rescued.length - 1) span.className = 'new-ally';
        els.hud.rescuedContainer.appendChild(span);
    });
}

// ========== SAVE / LOAD ==========
function saveGame() {
    try {
        localStorage.setItem('emojiWarzSave', JSON.stringify({
            level: state.level, points: state.points, totalLifetimePoints: state.totalLifetimePoints,
            heroClass: state.selectedClass, upgrades: state.upgrades, rescued: state.rescued,
            unlockedItems: state.unlockedItems, equippedSkin: state.equippedSkin, equippedAura: state.equippedAura
        }));
        els.saveToast.classList.remove('hidden');
        setTimeout(() => els.saveToast.classList.add('hidden'), 2000);
        SFX.upgrade();
    } catch(e) { console.error("Save failed:", e); }
}

function loadGame() {
    const errorEl = $('load-error'); errorEl.classList.add('hidden');
    try {
        const s = localStorage.getItem('emojiWarzSave');
        if (!s) { errorEl.innerText = "No save found."; errorEl.classList.remove('hidden'); return; }
        const save = JSON.parse(s);
        state.level = save.level || 1; state.points = save.points || 0;
        state.totalLifetimePoints = save.totalLifetimePoints || save.points || 0;
        state.selectedClass = save.heroClass || 'balanced';
        state.upgrades = save.upgrades; state.rescued = save.rescued || [];
        state.unlockedItems = save.unlockedItems || ['skin_base','aura_none'];
        state.equippedSkin = save.equippedSkin || 'skin_base';
        state.equippedAura = save.equippedAura || 'aura_none';

        const base = HERO_CLASSES[state.selectedClass];
        state.player = { ...base };
        for (let i = 1; i < state.upgrades.damage.level; i++) state.player.damage = Math.floor(state.player.damage * state.upgrades.damage.mult);
        for (let i = 1; i < state.upgrades.health.level; i++) state.player.maxHp = Math.floor(state.player.maxHp * state.upgrades.health.mult);
        state.player.hp = state.player.maxHp;
        for (let i = 1; i < state.upgrades.speed.level; i++) state.player.attackSpeed = Math.max(100, Math.floor(state.player.attackSpeed * state.upgrades.speed.mult));

        startGame(true);
    } catch(e) { errorEl.innerText = "Error loading save."; errorEl.classList.remove('hidden'); }
}

// ========== GAME OVER / WIN ==========
function gameOver() {
    state.isRunning = false; SFX.gameOver();
    if (state.heroElement) state.heroElement.classList.add('dying');
    setTimeout(() => {
        showScreen('end');
        $('end-title').innerText = "GAME OVER"; $('end-title').classList.add('game-over-text');
        $('end-title').style.color = ''; $('end-title').style.textShadow = ''; $('end-title').style.webkitTextFillColor = '';
        $('death-skull').style.display = 'block';
        $('final-level').innerText = state.level;
        els.screens.end.classList.add('blood-tint');
    }, 1000);
}

function winGame() {
    state.isRunning = false;
    setTimeout(() => {
        showScreen('end');
        const t = $('end-title');
        t.innerText = "VICTORY!"; t.classList.remove('game-over-text');
        t.style.color = '#00ff88'; t.style.textShadow = '0 0 20px #00ff88'; t.style.webkitTextFillColor = '#00ff88';
        $('death-skull').style.display = 'none';
        $('end-subtitle').innerText = "You defeated the Level 100 Boss!";
        els.screens.end.classList.remove('blood-tint');
    }, 500);
}

// ========== MARKETPLACE ==========
function loadGlobalProgress() {
    try {
        const s = localStorage.getItem('emojiWarzSave');
        if (s) { const sv = JSON.parse(s); state.totalLifetimePoints = sv.totalLifetimePoints || sv.points || 0; state.unlockedItems = sv.unlockedItems || ['skin_base','aura_none']; state.equippedSkin = sv.equippedSkin || 'skin_base'; state.equippedAura = sv.equippedAura || 'aura_none'; }
    } catch(e) {}
}

function showMarketplace() {
    Object.values(els.screens).forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    if (state.isRunning) saveGame();
    renderMarketplace();
    els.marketplace.screen.classList.remove('hidden'); els.marketplace.screen.classList.add('active');
}

function renderMarketplace() {
    els.marketplace.pointsDisplay.innerText = state.totalLifetimePoints;
    els.marketplace.skinsGrid.innerHTML = '';
    MARKET_ITEMS.skins.forEach(item => els.marketplace.skinsGrid.appendChild(createMarketItemHTML(item, 'skin')));
    els.marketplace.aurasGrid.innerHTML = '';
    MARKET_ITEMS.auras.forEach(item => els.marketplace.aurasGrid.appendChild(createMarketItemHTML(item, 'aura')));
}

function createMarketItemHTML(item, cat) {
    const unlocked = state.unlockedItems.includes(item.id);
    const equipped = (cat === 'skin' && state.equippedSkin === item.id) || (cat === 'aura' && state.equippedAura === item.id);
    const el = document.createElement('div');
    el.className = `market-item ${equipped ? 'equipped' : ''}`;
    let btn;
    if (equipped) btn = `<button class="item-buy-btn equipped-btn" disabled>EQUIPPED</button>`;
    else if (unlocked) btn = `<button class="item-buy-btn equip-btn" onclick="equipMarketItem('${item.id}','${cat}')">EQUIP</button>`;
    else { const can = state.totalLifetimePoints >= item.cost; btn = `<button class="item-buy-btn" ${!can?'disabled style="opacity:0.5"':''} onclick="buyMarketItem('${item.id}',${item.cost})">${item.cost}💎 BUY</button>`; }
    el.innerHTML = `<div class="item-visual">${item.emoji||'✨'}</div><div class="item-name">${item.name}</div>${btn}`;
    return el;
}

window.buyMarketItem = (id, cost) => { if (state.totalLifetimePoints >= cost) { state.totalLifetimePoints -= cost; state.unlockedItems.push(id); saveGame(); renderMarketplace(); SFX.upgrade(); } };
window.equipMarketItem = (id, cat) => { if (cat === 'skin') state.equippedSkin = id; else state.equippedAura = id; saveGame(); renderMarketplace(); SFX.shoot(); };

// ========== TRADE SYSTEM ==========
window.tradeSystem = function(type) {
    let cost = type === 'points' ? 1 : type === 'health' ? 3 : 5;
    if (state.rescued.length < cost) { SFX.hit(); createFloatingText(state.heroPosition.x, state.heroPosition.y - 30, 'NEED MORE PETS! 🐾', 'crit'); return; }
    state.rescued.splice(0, cost);
    switch(type) {
        case 'points': state.points += 500; state.totalLifetimePoints += 500; createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, '+500💎', 'points'); break;
        case 'health': state.player.hp = state.player.maxHp; createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, 'FULL HEAL', 'heal'); break;
        case 'maxhealth': state.player.maxHp += 50; state.player.hp += 50; createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, 'MAX HP UP', 'points'); break;
        case 'damage': state.player.damage = Math.floor(state.player.damage * 1.2); createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, 'DMG UP', 'crit'); break;
    }
    SFX.upgrade(); updateUI(); updateRescuedUI();
};

// ========== INIT ==========
window.addEventListener('load', init);
