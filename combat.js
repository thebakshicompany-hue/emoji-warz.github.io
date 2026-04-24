// ========== combat.js — Combat, Enemies, Abilities, Power-ups, UI ==========

// ========== DODGE ==========
function performDodge() {
    if (!state.isRunning || state.isDodging) return;
    const now = performance.now();
    if (now - state.lastDodgeTime < 1500) return; // 1.5s cooldown

    state.isDodging = true;
    state.lastDodgeTime = now;
    SFX.dodge();
    Haptics.light();

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

    // Ghost trails + particle dodge trail
    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            createDashTrail(state.heroPosition.x, state.heroPosition.y);
            ParticleEngine.dodgeTrail(state.heroPosition.x, state.heroPosition.y);
        }, i * 50);
    }

    const targetX = Math.max(20, Math.min(worldRect.width - 20, state.heroPosition.x + (dx/len) * dashDist));
    const targetY = Math.max(20, Math.min(worldRect.height - 20, state.heroPosition.y + (dy/len) * dashDist));
    
    if (window.anime) {
        anime({
            targets: state.heroPosition,
            x: targetX,
            y: targetY,
            duration: 300,
            easing: 'easeOutExpo',
            update: () => updateHeroPos()
        });
    } else {
        state.heroPosition.x = targetX;
        state.heroPosition.y = targetY;
        updateHeroPos();
    }
    
    state.heroTarget = { ...state.heroPosition };
    state.heroVelocity = { x: (dx/len) * 8, y: (dy/len) * 8 }; // Momentum burst

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

    // 3-hit combo swing animation
    if (state.heroElement) {
        state.comboSwing = (state.comboSwing % 3) + 1;
        state.heroElement.classList.remove('attacking', 'combo-1', 'combo-2', 'combo-3');
        void state.heroElement.offsetWidth;
        state.heroElement.classList.add(`combo-${state.comboSwing}`);
    }

    // Hitlag on crit
    if (isCrit) {
        TimeScale.set(0.15, 80);
        Haptics.crit();
    } else {
        Haptics.light();
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
    const projIcon = state.player.projEmoji || 'flame';
    el.innerHTML = `<i data-lucide="${projIcon}"></i>`;
    el.style.left = `${fromX}px`; el.style.top = `${fromY}px`;
    els.world.appendChild(el);
    if (window.lucide) window.lucide.createIcons();

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
    const isFinalBoss = state.level >= 1000;
    const isEliteLevel = state.level % 3 === 0 && !isBossLevel;

    if (isBossLevel || isFinalBoss) {
        showBossWarning(); count = 1;
        // Cinematic boss entrance with conversation
        const convo = getBossConversation(state.level);
        state.isRunning = false; // Pause game during cutscene
        setTimeout(() => {
            Dialogue.play(convo, () => {
                state.isRunning = true;
                state.lastTick = performance.now();
                const crack = document.createElement('div');
                crack.className = 'ground-crack'; crack.style.left = '50%'; crack.style.top = '150px';
                els.world.appendChild(crack);
                setTimeout(() => { if (crack.parentNode) crack.remove(); }, 3000);
                Camera.shake(15, 600);
                ParticleEngine.bossEntrance(worldRect.width / 2, 150);
                Haptics.heavy();
                requestAnimationFrame(gameLoop);
            });
        }, 1500);
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
    el.innerHTML = `<i data-lucide="${data.emoji}"></i>`;

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
    if (window.lucide) window.lucide.createIcons();

    // Anime.js spawn animation
    if (window.anime) {
        anime({
            targets: el,
            scale: [0, 1],
            opacity: [0, 1],
            duration: data.isBoss ? 1500 : 800,
            elasticity: 600,
            easing: 'easeOutElastic(1, .5)'
        });
    }
}

function updateEnemyPos(e) {
    const offset = e.isFinalBoss ? 60 : (e.isBoss ? 50 : 22);
    // GPU-composited positioning
    e.element.style.transform = `translate3d(${e.x - offset}px, ${e.y - offset}px, 0)`;
    e.element.style.left = '0'; e.element.style.top = '0';
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
                // Telegraph danger zone before attacking
                if (!e._telegraphed) {
                    e._telegraphed = true;
                    const tz = document.createElement('div');
                    tz.className = 'danger-zone';
                    const size = atkRange * 2.5;
                    tz.style.width = `${size}px`; tz.style.height = `${size}px`;
                    tz.style.left = `${e.x}px`; tz.style.top = `${e.y}px`;
                    els.world.appendChild(tz);
                    setTimeout(() => { if (tz.parentNode) tz.remove(); }, 500);
                    ParticleEngine.spawnTelegraph(e.x, e.y, size/2, 400, 'rgba(255,0,0,0.3)');
                }

                if (!state.isDodging) {
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
                e._telegraphed = false;
                e.element.style.transform += ' scale(1.15)';
                setTimeout(() => { if (e.element) updateEnemyPos(e); }, 100);
            }
        }
    }

    // Auto attack tick
    autoAttackTick(time);
}

// ========== DAMAGE SYSTEM ==========
function damageEnemy(enemy, amount, isCrit = false) {
    if (enemy.hp <= 0) return;

    // Rage mode: 3x damage
    if (state.rageMode) amount = Math.floor(amount * 3);

    enemy.hp -= amount;
    SFX.hit();

    enemy.hpFill.style.width = `${Math.max(0, enemy.hp/enemy.maxHp)*100}%`;
    createFloatingText(enemy.x, enemy.y - 15, amount, isCrit ? 'crit' : 'damage');

    // Knockback with anime.js spring physics
    const dx = enemy.x - state.heroPosition.x, dy = enemy.y - state.heroPosition.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 0) {
        const kb = isCrit ? 50 : 20;
        enemy.x += (dx/dist) * kb; enemy.y += (dy/dist) * kb;
        
        if (window.anime) {
            const offset = enemy.isFinalBoss ? 60 : (enemy.isBoss ? 50 : 22);
            anime({
                targets: enemy.element,
                translateX: enemy.x - offset,
                translateY: enemy.y - offset,
                duration: 600,
                easing: 'easeOutElastic(1, .6)'
            });
        } else {
            updateEnemyPos(enemy);
        }
    }

    // Particle effects + cinematic impact
    if (isCrit) {
        ParticleEngine.critFlash(enemy.x, enemy.y);
        Camera.shake(8, 200);
        cinematicImpact();
    } else {
        ParticleEngine.bloodBurst(enemy.x, enemy.y, dx, dy);
        Camera.shake(3, 100);
    }

    // Stagger animation
    enemy.element.classList.remove('hit', 'stagger');
    void enemy.element.offsetWidth;
    enemy.element.classList.add(isCrit ? 'stagger' : 'hit');

    // Juggle physics: crits launch enemies upward briefly
    if (isCrit && !enemy.isBoss && !enemy.isFinalBoss) {
        enemy.element.classList.add('juggled');
        setTimeout(() => enemy.element.classList.remove('juggled'), 300);
    }

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
    // Shatter death animation + particles
    enemy.element.classList.add('shatter-death');
    ParticleEngine.explosion(enemy.x, enemy.y, enemy.isBoss ? 2 : (enemy.isElite ? 1.5 : 1));
    Camera.shake(enemy.isBoss ? 15 : 5, enemy.isBoss ? 400 : 150);
    Haptics.medium();

    // Execution finisher for bosses
    if (enemy.isBoss || enemy.isFinalBoss) {
        TimeScale.set(0.1, 500);
        cinematicImpact();
        cinematicKillcam();
        ParticleEngine.deathShatter(enemy.x, enemy.y);
        Haptics.heavy();
    }

    let pts = 1 + Math.floor(state.level * 0.5);
    if (enemy.isBoss) pts *= 10;
    if (enemy.isFinalBoss) pts *= 100;
    if (enemy.isElite) pts *= 3;

    state.points += pts;
    state.totalLifetimePoints += pts;
    state.enemiesDefeatedInLevel++;
    SFX.coin();
    createFloatingText(enemy.x, enemy.y, `+${pts}💎`, 'points');

    if (Math.random() < 0.15 || enemy.isBoss || enemy.isElite) spawnPowerup(enemy.x, enemy.y);

    updateUI();

    if (enemy.isFinalBoss) {
        els.world.classList.add('arena-flash');
        setTimeout(() => els.world.classList.remove('arena-flash'), 300);
        winGame();
    } else if (enemy.isBoss) {
        els.world.classList.add('arena-flash');
        setTimeout(() => els.world.classList.remove('arena-flash'), 300);
        Camera.shake(20, 500);
        levelUp();
    } else if (state.enemiesDefeatedInLevel >= state.enemiesRequiredForNextLevel) {
        levelUp();
    }

    setTimeout(() => {
        if (enemy.element?.parentNode) enemy.element.remove();
        state.enemies = state.enemies.filter(e => e.id !== enemy.id);
    }, 500);
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
    if (!state.isRunning || state.player.hp <= 0) return;
    
    if (state.activeBuffs.find(b => b.type === 'fortify')) amount = Math.floor(amount * 0.3);
    state.player.hp = Math.max(0, state.player.hp - amount);
    
    updateHealthUI();
    triggerScreenShake('medium');
    Haptics.medium();
    
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 15, `-${amount}`, 'crit');
    ParticleEngine.bloodBurst(state.heroPosition.x, state.heroPosition.y, 0, -1);

    // Anime.js HUD Damage Shake
    if (window.anime) {
        anime({
            targets: '#hud',
            translateX: [0, -12, 12, -12, 12, 0],
            duration: 400,
            easing: 'easeInOutQuad'
        });
        if (state.heroElement) {
            anime({
                targets: state.heroElement,
                filter: ['brightness(1) contrast(1)', 'brightness(4) contrast(3)', 'brightness(1) contrast(1)'],
                duration: 200,
                easing: 'linear'
            });
        }
    }

    if (state.player.hp <= 0) {
        Haptics.death();
        ParticleEngine.deathShatter(state.heroPosition.x, state.heroPosition.y);
        triggerScreenShake('heavy');
        TimeScale.set(0.2, 800);
        gameOver();
    }
}

function healPlayer(amount) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 15, `+${Math.floor(amount)}`, 'heal');
    updateUI();
}

function levelUp() {
    if (state.isGuest && state.level >= 100) {
        guestLimitReached();
        return;
    }
    state.level++;
    state.enemiesDefeatedInLevel = 0;
    state.enemiesRequiredForNextLevel = Math.min(100, 5 + state.level * 2);
    
    healPlayer(state.player.maxHp * 0.2);
    ParticleEngine.levelUpBurst(state.heroPosition.x, state.heroPosition.y);
    createFloatingText(state.heroPosition.x, state.heroPosition.y - 40, "LEVEL UP!", 'level-up');
    
    // Anime.js Level Up Shockwave
    if (window.anime) {
        anime({
            targets: '#game-world',
            filter: ['contrast(1.2) brightness(1.2)', 'contrast(2) brightness(2)', 'contrast(1.2) brightness(1.2)'],
            duration: 600,
            easing: 'easeOutQuart'
        });
    }

    if (state.level % 10 === 0) {
        Dialogue.show(state.level);
        Weather.intensity = Math.min(1, Weather.intensity + 0.1);
    }
    updateUI();
    
    if (state.level % 5 === 0) {
        const ally = RESCUED_POOL[Math.floor(Math.random() * RESCUED_POOL.length)];
        state.rescued.push(ally);
        updateRescuedUI(true);
        SFX.coin();
        // Brief rescue dialogue
        if (state.level <= 50 || state.level % 25 === 0) {
            const lines = [
                { speaker: ally + ' SURVIVOR', text: 'You came... I thought no one would come.' },
                { speaker: 'HERO', text: 'Stay close. More of them are coming.' }
            ];
            state.isRunning = false;
            setTimeout(() => {
                Dialogue.play(lines, () => {
                    state.isRunning = true;
                    state.lastTick = performance.now();
                    requestAnimationFrame(gameLoop);
                });
            }, 300);
        } else {
            createFloatingText(state.heroPosition.x, state.heroPosition.y - 60, `${ally} RESCUED`, "points");
        }
    }
    SFX.levelUp();
    ParticleEngine.levelUpBurst(state.heroPosition.x, state.heroPosition.y);
    updateWeatherForLevel(state.level);
    updateUI();

    // Spawn environmental hazards at higher levels
    if (state.level >= 15 && state.level % 5 === 0) {
        spawnEnvironmentHazard();
    }
}

// ========== POWER-UPS ==========
function spawnPowerup(x, y) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const el = document.createElement('div');
    el.className = 'powerup'; 
    el.innerHTML = `<i data-lucide="${type.emoji}"></i>`;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    els.world.appendChild(el);
    if (window.lucide) window.lucide.createIcons();
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
function updateComboUI() {
    const el = document.getElementById('combo-container');
    const num = document.getElementById('combo-count');
    const mult = document.getElementById('combo-mult');
    if (!el || !num || !mult) return;

    if (state.combo > 0) {
        el.classList.add('active');
        num.innerText = state.combo;
        mult.innerText = `x${state.comboMult.toFixed(1)}`;
        
        // Anime.js Combo Punch
        if (window.anime) {
            anime({
                targets: el,
                scale: [1, 1.4, 1],
                rotate: [0, anime.random(-5, 5), 0],
                duration: 200,
                easing: 'easeOutElastic(1, .6)'
            });
        }
    } else {
        el.classList.remove('active');
    }
}

function updateCooldowns(time) {
    const abilityReady = (time - state.lastAbilityTime >= state.player.abilityCD);
    const dodgeReady = (time - state.lastDodgeTime >= 2000); // 2s dodge cd

    const abBtn = document.getElementById('ability-btn');
    if (abBtn) {
        if (abilityReady) {
            if (!abBtn.classList.contains('ready')) {
                abBtn.classList.add('ready');
                if (window.anime) {
                    anime({
                        targets: abBtn,
                        scale: [1, 1.15, 1],
                        filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)'],
                        duration: 800,
                        loop: true,
                        easing: 'easeInOutSine'
                    });
                }
            }
        } else {
            abBtn.classList.remove('ready');
            if (window.anime) anime.remove(abBtn);
            abBtn.style.transform = 'scale(1)';
            abBtn.style.filter = 'brightness(1)';
        }
    }
}

// ========== VISUAL FX ==========
function createFloatingText(x, y, text, type) {
    const el = document.createElement('div');
    el.className = `floating-text ${type}`; el.innerText = text;
    el.style.left = `${x + (Math.random()-0.5)*40}px`;
    el.style.top = `${y}px`;
    els.textLayer.appendChild(el);

    if (window.anime) {
        anime({
            targets: el,
            translateY: [-20, -100],
            opacity: [1, 0],
            scale: [1, 1.2],
            duration: 1000,
            easing: 'easeOutExpo',
            complete: () => el.remove()
        });
    } else {
        setTimeout(() => { if (el.parentNode) el.remove(); }, 800);
    }
}

function createImpactSlash(x, y, isCrit) {
    for (let i = 0; i < (isCrit ? 3 : 1); i++) {
        const s = document.createElement('div');
        s.className = 'slash-effect'; 
        s.style.left = `${x}px`; s.style.top = `${y}px`;
        const rot = Math.random() * 360;
        s.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scaleX(0)`;
        els.textLayer.appendChild(s);

        if (window.anime) {
            anime({
                targets: s,
                scaleX: [0, 1.5],
                opacity: [1, 0],
                duration: 300,
                easing: 'easeOutQuart',
                complete: () => s.remove()
            });
        } else {
            setTimeout(() => { if (s.parentNode) s.remove(); }, 200);
        }
    }
}

function triggerScreenShake(type = 'light') {
    Camera.shake(type === 'heavy' ? 10 : 4, type === 'heavy' ? 300 : 150);
}

// ========== ENVIRONMENTAL HAZARDS ==========
function spawnEnvironmentHazard() {
    const worldRect = els.world.getBoundingClientRect();
    const type = Math.random() > 0.5 ? 'lava' : 'spikes';
    const x = 50 + Math.random() * (worldRect.width - 100);
    const y = 50 + Math.random() * (worldRect.height - 100);
    const duration = 15000 + state.level * 100;
    ParticleEngine.spawnHazard(x, y, type, duration);
}

function updateHazards(dt) {
    if (!ParticleEngine.hazards) return;
    for (const h of ParticleEngine.hazards) {
        if (!h.active) continue;
        // Damage hero if inside hazard
        const dx = state.heroPosition.x - h.x, dy = state.heroPosition.y - h.y;
        if (dx*dx + dy*dy < h.radius * h.radius) {
            const dmg = h.type === 'lava' ? Math.ceil(state.level * 0.3) : Math.ceil(state.level * 0.5);
            if (Math.random() < 0.03) { // Tick damage
                damagePlayer(dmg);
                createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, h.type === 'lava' ? '🔥' : '💥', 'crit');
            }
        }
    }
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
    const targetText = `${Math.floor(state.player.hp)}/${Math.floor(state.player.maxHp)}`;
    els.hud.healthText.innerText = targetText;
    
    if (els.hud.healthBar && window.anime) {
        const targetWidth = `${(state.player.hp/state.player.maxHp)*100}%`;
        anime({
            targets: els.hud.healthBar,
            width: targetWidth,
            duration: 300,
            easing: 'easeOutQuad'
        });
    } else if (els.hud.healthBar) {
        els.hud.healthBar.style.width = `${(state.player.hp/state.player.maxHp)*100}%`;
    }
}

function updateUI() {
    updateHealthUI();
    els.hud.levelDisplay.innerText = state.level;
    const prog = state.level % 10 === 0 ? 100 : (state.enemiesDefeatedInLevel/state.enemiesRequiredForNextLevel)*100;
    const targetWidth = `${Math.min(100, prog)}%`;
    
    if (window.anime) {
        anime({
            targets: els.hud.levelProgress,
            width: targetWidth,
            duration: 500,
            easing: 'easeOutElastic(1, .8)'
        });
    } else {
        els.hud.levelProgress.style.width = targetWidth;
    }

    if (els.hud.pointsDisplay.innerText !== String(state.points)) {
        const oldPoints = parseInt(els.hud.pointsDisplay.innerText) || 0;
        if (window.anime) {
            anime({
                targets: els.hud.pointsDisplay,
                innerText: [oldPoints, state.points],
                round: 1,
                duration: 1000,
                easing: 'easeOutExpo',
                begin: () => els.hud.pointsDisplay.classList.add('collected'),
                complete: () => els.hud.pointsDisplay.classList.remove('collected')
            });
        } else {
            els.hud.pointsDisplay.innerText = state.points;
        }
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
    // Death conversation
    setTimeout(() => {
        Dialogue.play(CONVERSATIONS.death, () => {
            showScreen('end');
            $('end-title').innerText = "KILLED IN ACTION";
            $('end-title').classList.add('game-over-text');
            $('end-title').style.color = ''; $('end-title').style.textShadow = ''; $('end-title').style.webkitTextFillColor = '';
            $('death-skull').style.display = 'block';
            $('final-level').innerText = state.level;
            els.screens.end.classList.add('blood-tint');
        });
    }, 800);
}

function guestLimitReached() {
    state.isRunning = false; SFX.gameOver();
    setTimeout(() => {
        showScreen('end');
        const t = $('end-title');
        t.innerText = "GUEST LIMIT"; t.classList.add('game-over-text');
        t.style.color = '#00f0ff'; t.style.textShadow = '0 0 20px #00f0ff'; t.style.webkitTextFillColor = '#00f0ff';
        $('death-skull').style.display = 'none';
        $('end-subtitle').innerText = "You reached Level 100!\nLogin to play up to Level 1000!";
        els.screens.end.classList.remove('blood-tint');
    }, 500);
}

function winGame() {
    state.isRunning = false;
    // Victory conversation
    setTimeout(() => {
        Dialogue.play(CONVERSATIONS.victory, () => {
            showScreen('end');
            const t = $('end-title');
            t.innerText = "WAR IS OVER"; t.classList.remove('game-over-text');
            t.style.color = '#22aa22'; t.style.textShadow = '0 0 20px rgba(30,150,30,0.5)'; t.style.webkitTextFillColor = '#22aa22';
            $('death-skull').style.display = 'none';
            $('end-subtitle').innerText = "The darkness has been destroyed.";
            els.screens.end.classList.remove('blood-tint');
        });
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
