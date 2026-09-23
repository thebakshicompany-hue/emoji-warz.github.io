// ========== multiplayer.js — Co-op networking (Colyseus) ==========
//
// Talks to a Colyseus room deployed on the project's Hugging Face Space backend.
// The server code that must be deployed there lives in /multiplayer-server
// (see /multiplayer-server/README.md for deploy steps).
//
// Design: "host-relay" co-op. Whoever creates/first-joins the match room runs
// the exact same single-player simulation this game already has (wave
// spawning, enemy AI, boss cutscenes, upgrades) and broadcasts a compact
// snapshot of it a few times a second. Guests render that snapshot, move
// their own hero locally, and report hits/attacks back through the server —
// the host resolves them authoritatively. This lets almost all of the
// existing combat/wave code run completely unmodified for the host, while
// guests get a lightweight read-mostly view of the same battle.
//
// PvP is intentionally not wired up yet — the room already carries a `mode`
// field and the server has a placeholder for an `attack_player` handler so a
// competitive arena mode can be added later without changing this protocol.

const Multiplayer = {
    // Your Colyseus HF Space. Colyseus.Client auto-upgrades http(s) -> ws(s).
    // Edit this if your Space's URL differs (e.g. a custom subdomain).
    SERVER_URL: 'https://vbnm1bbg-matheybackend.hf.space',

    client: null,
    room: null,
    active: false,   // true while a networked match is actually being played
    isHost: false,
    myId: null,

    _remoteEls: new Map(), // sessionId -> { el, tag }
    _lastPlayerSend: 0,
    _lastSyncSend: 0,
    els: {},

    init() {
        this.els = {
            status: document.getElementById('lobby-status'),
            joinControls: document.getElementById('lobby-join-controls'),
            roomView: document.getElementById('lobby-room-view'),
            roomCodeText: document.getElementById('lobby-room-code-text'),
            playersList: document.getElementById('lobby-players'),
            startBtn: document.getElementById('mp-start-btn'),
            waitMsg: document.getElementById('lobby-wait-msg'),
            error: document.getElementById('lobby-error'),
            badge: document.getElementById('mp-connection-badge'),
            hudPlayers: document.getElementById('mp-players-hud')
        };

        document.getElementById('mp-quick-match-btn')?.addEventListener('click', () => this.quickMatch());
        document.getElementById('mp-join-code-btn')?.addEventListener('click', () => {
            const code = document.getElementById('mp-room-code').value.trim();
            if (code) this.joinByCode(code);
        });
        this.els.startBtn?.addEventListener('click', () => this.startMatch());
        document.getElementById('mp-leave-btn')?.addEventListener('click', () => this.leaveRoom());
        document.getElementById('lobby-back-btn')?.addEventListener('click', () => {
            this.leaveRoom();
            showScreen('start');
        });
    },

    enterLobby() {
        this._setError('');
        if (this.room) { this._renderLobbyPlayers(); return; }
        this.els.joinControls.classList.remove('hidden');
        this.els.roomView.classList.add('hidden');
        this.els.status.innerText = 'Not connected';
    },

    // Every client's #game-world can be a different pixel size, so raw pixel
    // coordinates aren't comparable across players. We send/receive
    // positions as fractions (0..1) of the sender's/receiver's own world
    // rect instead, and only convert to real pixels locally.
    _toFrac(x, y) {
        const wr = els.world.getBoundingClientRect();
        return { x: wr.width ? x / wr.width : 0, y: wr.height ? y / wr.height : 0 };
    },
    _fromFrac(fx, fy) {
        const wr = els.world.getBoundingClientRect();
        return { x: fx * wr.width, y: fy * wr.height };
    },

    _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    },

    _setError(msg) {
        if (!this.els.error) return;
        if (msg) { this.els.error.innerText = msg; this.els.error.classList.remove('hidden'); }
        else this.els.error.classList.add('hidden');
    },

    _getClient() {
        if (!this.client) {
            if (typeof Colyseus === 'undefined') { this._setError('Multiplayer library failed to load.'); return null; }
            this.client = new Colyseus.Client(this.SERVER_URL);
        }
        return this.client;
    },

    async quickMatch() {
        const client = this._getClient();
        if (!client) return;
        this._setError(''); this.els.status.innerText = 'Connecting…';
        try {
            const room = await client.joinOrCreate('emoji_warz', { name: Profile.name || 'Player', hero: state.selectedClass || 'balanced' });
            this._onJoined(room);
        } catch (e) {
            console.error('[Multiplayer] quickMatch failed', e);
            this._setError('Could not reach the multiplayer server. Is it deployed and awake?');
            this.els.status.innerText = 'Not connected';
        }
    },

    async joinByCode(code) {
        const client = this._getClient();
        if (!client) return;
        this._setError(''); this.els.status.innerText = 'Connecting…';
        try {
            const room = await client.joinById(code.trim(), { name: Profile.name || 'Player', hero: state.selectedClass || 'balanced' });
            this._onJoined(room);
        } catch (e) {
            console.error('[Multiplayer] joinByCode failed', e);
            this._setError('Room not found, full, or already started.');
            this.els.status.innerText = 'Not connected';
        }
    },

    _onJoined(room) {
        this.room = room;
        this.myId = room.sessionId;
        this.els.status.innerText = 'Connected!';
        this.els.joinControls.classList.add('hidden');
        this.els.roomView.classList.remove('hidden');
        this.els.roomCodeText.innerText = room.id;

        room.onStateChange(() => this._renderLobbyPlayers());
        room.onMessage('game_started', () => this._beginMatch());
        room.onMessage('became_host', () => { this.isHost = true; this._renderLobbyPlayers(); });
        room.onMessage('host_sync', data => this._applyHostSync(data));
        room.onMessage('attack', data => this._onHostReceivedAttack(data));
        room.onMessage('damage_player', data => { if (state.isRunning) damagePlayer(data.amount); });
        room.onMessage('reward_player', data => {
            state.points += data.points; state.totalLifetimePoints += data.points;
            updateUI();
            createFloatingText(state.heroPosition.x, state.heroPosition.y - 20, `+${data.points}💎`, 'points');
        });
        room.onMessage('chat', data => {
            if (state.isRunning) createFloatingText(state.heroPosition.x, state.heroPosition.y - 60, `${this._esc(data.name)}: ${this._esc(data.text)}`, 'points');
        });
        room.onLeave(() => {
            // Fall back to local single-player behavior rather than breaking the game.
            this.active = false;
            this.els.badge?.classList.add('hidden');
            this.els.hudPlayers?.classList.add('hidden');
            this.els.status.innerText = 'Disconnected';
        });

        this._renderLobbyPlayers();
    },

    _renderLobbyPlayers() {
        if (!this.room || !this.els.playersList) return;
        let html = '';
        let amHost = false;
        this.room.state.players.forEach((p, sessionId) => {
            if (sessionId === this.myId && p.isHost) amHost = true;
            html += `<div class="lobby-player-chip"><span class="lp-name">${this._esc(p.name)}${sessionId === this.myId ? ' (you)' : ''}</span>${p.isHost ? '<span class="lp-tag">HOST</span>' : ''}</div>`;
        });
        this.els.playersList.innerHTML = html;
        this.isHost = amHost;
        this.els.startBtn?.classList.toggle('hidden', !amHost);
        this.els.waitMsg?.classList.toggle('hidden', amHost);
    },

    startMatch() {
        if (this.room) this.room.send('start_game');
    },

    leaveRoom() {
        if (this.room) { try { this.room.leave(); } catch (e) {} }
        this.room = null; this.active = false; this.isHost = false;
        this.els.badge?.classList.add('hidden');
        this.els.hudPlayers?.classList.add('hidden');
        for (const sessionId of Array.from(this._remoteEls.keys())) this._removeRemoteHero(sessionId);
        if (window.ThreeEngine) ThreeEngine.setAllyGlow(false);
    },

    _beginMatch() {
        const me = this.room.state.players.get(this.myId);
        this.isHost = !!(me && me.isHost);
        this.active = true;
        this.els.badge?.classList.remove('hidden');
        this.els.hudPlayers?.classList.remove('hidden');
        if (window.ThreeEngine) ThreeEngine.setAllyGlow(true);
        state.selectedClass = (me && me.hero) || state.selectedClass || 'balanced';
        startGame(); // also calls showScreen('game') as its first step
    },

    // ========== PER-FRAME NETWORK SYNC (called from the main game loop) ==========
    tick(t) {
        if (!this.active || !this.room) return;

        if (t - this._lastPlayerSend > 100) {
            this._lastPlayerSend = t;
            const f = this._toFrac(state.heroPosition.x, state.heroPosition.y);
            this.room.send('player_update', {
                x: f.x, y: f.y,
                hp: Math.round(state.player.hp), maxHp: Math.round(state.player.maxHp)
            });
        }

        if (this.isHost && t - this._lastSyncSend > 120) {
            this._lastSyncSend = t;
            const enemies = state.enemies.filter(e => e.hp > 0).slice(0, 60).map(e => {
                const f = this._toFrac(e.x, e.y);
                return {
                    id: e.id, x: f.x, y: f.y, hp: Math.round(e.hp), maxHp: Math.round(e.maxHp),
                    emoji: e.emoji, isBoss: !!e.isBoss, isFinalBoss: !!e.isFinalBoss, isElite: !!e.isElite
                };
            });
            this.room.send('host_sync', {
                enemies, level: state.level,
                enemiesDefeatedInLevel: state.enemiesDefeatedInLevel,
                enemiesRequiredForNextLevel: state.enemiesRequiredForNextLevel,
                betweenWaves: state.betweenWaves, waveTimer: Math.round(state.waveTimer)
            });
        }

        this._renderRemoteHeroes();
    },

    // Enemy AI (host only) targets the nearest of all players, not just itself.
    // Positions come back already converted into the host's own pixel space.
    forEachRemotePlayer(cb) {
        if (!this.room) return;
        this.room.state.players.forEach((p, sessionId) => {
            if (sessionId === this.myId) return;
            const pos = this._fromFrac(p.x, p.y);
            cb(sessionId, { x: pos.x, y: pos.y, hp: p.hp, maxHp: p.maxHp, name: p.name, hero: p.hero });
        });
    },

    reportAttack(enemyId, amount, isCrit) {
        if (this.room) this.room.send('attack', { enemyId, amount, isCrit });
    },

    damageRemotePlayer(targetId, amount) {
        if (this.room && this.isHost) this.room.send('damage_player', { targetId, amount });
    },

    rewardPlayer(targetId, points) {
        if (this.room && this.isHost) this.room.send('reward_player', { targetId, points });
    },

    _onHostReceivedAttack(data) {
        if (!this.isHost) return;
        const enemy = state.enemies.find(e => e.id === data.enemyId);
        if (enemy && enemy.hp > 0) damageEnemy(enemy, data.amount, data.isCrit, data.senderId);
    },

    // ========== GUEST: apply the host's authoritative world snapshot ==========
    _applyHostSync(data) {
        if (this.isHost || !data) return;

        const incomingIds = new Set();
        for (const ed of (data.enemies || [])) {
            incomingIds.add(ed.id);
            const pos = this._fromFrac(ed.x, ed.y);
            let e = state.enemies.find(x => x.id === ed.id);
            if (!e) {
                createEnemy({
                    id: ed.id, x: pos.x, y: pos.y, maxHp: ed.maxHp, hp: ed.hp, emoji: ed.emoji,
                    isBoss: ed.isBoss, isFinalBoss: ed.isFinalBoss, isElite: ed.isElite,
                    speed: 0, damage: 0, attackDelay: 999999, lastAttackTime: 0
                });
            } else {
                e.x = pos.x; e.y = pos.y; e.hp = ed.hp; e.maxHp = ed.maxHp;
                updateEnemyPos(e);
                if (e.hpFill) e.hpFill.style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
                ThreeEngine.updateEntity('enemy_' + e.id, e.x, e.y);
            }
        }
        // Remove enemies the host no longer reports (died or wave cleared)
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            if (!incomingIds.has(e.id)) {
                if (e.element?.parentNode) e.element.remove();
                ThreeEngine.removeEntity('enemy_' + e.id);
                state.enemies.splice(i, 1);
            }
        }

        state.level = data.level;
        state.enemiesDefeatedInLevel = data.enemiesDefeatedInLevel;
        state.enemiesRequiredForNextLevel = data.enemiesRequiredForNextLevel;
        state.betweenWaves = data.betweenWaves;
        state.waveTimer = data.waveTimer;
        if (els.wave?.timer) els.wave.timer.classList.toggle('hidden', !data.betweenWaves);
        if (els.wave?.countdown) els.wave.countdown.innerText = Math.max(0, Math.ceil(data.waveTimer / 1000));
        updateUI();
    },

    // ========== Remote teammate rendering ==========
    _renderRemoteHeroes() {
        if (!this.room) return;
        const seen = new Set();
        this.room.state.players.forEach((p, sessionId) => {
            if (sessionId === this.myId) return;
            seen.add(sessionId);
            const pos = this._fromFrac(p.x, p.y);
            let rec = this._remoteEls.get(sessionId);
            if (!rec) rec = this._createRemoteHero(sessionId, p);
            rec.el.style.transform = `translate3d(${pos.x - 30}px, ${pos.y - 30}px, 0)`;
            rec.el.style.left = '0'; rec.el.style.top = '0';
            rec.el.style.opacity = p.hp > 0 ? '0.85' : '0.25';
            ThreeEngine.updateEntity('mp_' + sessionId, pos.x, pos.y);
        });
        for (const sessionId of Array.from(this._remoteEls.keys())) {
            if (!seen.has(sessionId)) this._removeRemoteHero(sessionId);
        }
        this._renderTeammateHud();
    },

    _createRemoteHero(sessionId, p) {
        const el = document.createElement('div');
        el.className = 'entity hero remote-hero';
        const emoji = (HERO_CLASSES[p.hero] || HERO_CLASSES.balanced).emoji;
        const tag = document.createElement('div');
        tag.className = 'remote-hero-tag';
        tag.innerText = p.name || 'Player';
        el.innerHTML = `<div class="hero-inner">${emoji}</div>`;
        el.appendChild(tag);
        els.world.appendChild(el);
        ThreeEngine.spawn('mp_' + sessionId, 'ally');
        const rec = { el, tag };
        this._remoteEls.set(sessionId, rec);
        return rec;
    },

    _removeRemoteHero(sessionId) {
        const rec = this._remoteEls.get(sessionId);
        if (rec?.el?.parentNode) rec.el.remove();
        ThreeEngine.removeEntity('mp_' + sessionId);
        this._remoteEls.delete(sessionId);
    },

    _renderTeammateHud() {
        if (!this.room || !this.els.hudPlayers) return;
        let html = '';
        this.room.state.players.forEach((p, sessionId) => {
            if (sessionId === this.myId) return;
            const emoji = (HERO_CLASSES[p.hero] || HERO_CLASSES.balanced).emoji;
            const pct = Math.max(0, Math.min(100, (p.hp / (p.maxHp || 1)) * 100));
            html += `<div class="mp-player-mini ${p.hp <= 0 ? 'dead' : ''}"><span class="mpm-emoji">${emoji}</span>${this._esc(p.name)}<span class="mpm-hp"><span class="mpm-hp-fill" style="width:${pct}%"></span></span></div>`;
        });
        this.els.hudPlayers.innerHTML = html;
    }
};

window.addEventListener('load', () => Multiplayer.init());
