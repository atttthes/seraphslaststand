// game.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DETECÇÃO DE DISPOSITIVO DE TOQUE ---
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
        document.body.classList.add('touch-enabled');
    }

    // --- ELEMENTOS DO DOM ---
    const mainMenu = document.getElementById('mainMenu');
    const appWrapper = document.getElementById('app-wrapper');
    const gameContainer = document.getElementById('gameContainer');
    const backgroundCanvas = document.getElementById('backgroundCanvas');
    const bgCtx = backgroundCanvas.getContext('2d');
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    const playerNameInput = document.getElementById('playerNameInput');
    const startSinglePlayerBtn = document.getElementById('startSinglePlayerBtn');
    const startMultiplayerBtn = document.getElementById('startMultiplayerBtn');
    const showRankingBtn = document.getElementById('showRankingBtn');
    const hpBar = document.getElementById('hpBar');
    const expBar = document.getElementById('expBar');
    const timerDisplay = document.getElementById('timer');
    const waveDisplay = document.getElementById('waveInfo');
    const pauseBtn = document.getElementById('pauseBtn');
    const quitBtn = document.getElementById('quitBtn');
    const totalReactionBtn = document.getElementById('totalReactionBtn');
    const gameOverModal = document.getElementById('gameOverModal');
    const finalTimeDisplay = document.getElementById('finalTime');
    const finalWaveDisplay = document.getElementById('finalWave');
    const restartBtn = document.getElementById('restartBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const upgradeModal = document.getElementById('upgradeModal');
    const upgradeOptionsContainer = document.getElementById('upgradeOptions');
    const rerollUpgradesBtn = document.getElementById('rerollUpgradesBtn');
    const rankingModal = document.getElementById('rankingModal');
    const rankingTableBody = document.querySelector('#rankingTable tbody');
    const closeRankingBtn = document.getElementById('closeRankingBtn');

    // --- ATUALIZADO: Elementos do Modal de Configurações ---
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const fpsSelector = document.getElementById('fpsSelector');
    const effectsToggle = document.getElementById('effectsToggle');
    const uiOpacitySlider = document.getElementById('uiOpacitySlider');
    const uiOpacityValue = document.getElementById('uiOpacityValue');
    const aimOpacitySlider = document.getElementById('aimOpacitySlider');
    const aimOpacityValue = document.getElementById('aimOpacityValue');

    // Controles Touch
    const touchLeftBtn = document.getElementById('touchLeft');
    const touchRightBtn = document.getElementById('touchRight');
    const aimJoystick = document.getElementById('aimJoystick');
    const aimJoystickKnob = document.getElementById('aimJoystickKnob');
    const touchJumpBtn = document.getElementById('touchJumpBtn');

    // --- ESTADO DO JOGO ---
    let isGameRunning = false, isPaused = false, isGameOver = false, isMultiplayer = false;
    let gameTime = 0, animationFrameId, socket, playerName = "Jogador";
    let player, otherPlayers = {}, enemies = [], projectiles = [], enemyProjectiles = [], particles = [], lightningStrikes = [];
    
    const logicalWidth = 1600, logicalHeight = 900;
    let scaleX = 1, scaleY = 1;

    let backgroundOrbs = [];
    let reactionBlade = { active: false, x: 0, y: 0, width: 0, height: 15, hitEnemies: [] };
    let reflectedProjectiles = [];
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };
    const aimStick = { active: false, angle: 0 };
    let aimAngle = 0;

    // --- ESTADO DAS HORDAS (single-player) ---
    let spState = {
        wave: 0, waveState: 'intermission', waveTimer: 5 * 60,
        classShootingCooldowns: { basic: 0, sniper: 0, ricochet: 0, boss: 0 }
    };
    const ENEMY_SHOOT_DELAY_TICKS = 18;

    // --- CONFIGURAÇÕES DO JOGO ---
    let gameSettings = {};
    let lastFrameTime = 0;
    let targetInterval = 1000 / 60; // Padrão 60 FPS

    const gravity = 0.9;
    const NEON_GREEN = '#00ff7f';
    const SCALE_FACTOR = 1.33;
    const SCALE_DOWN_ATTR_FACTOR = 0.67;
    const SCALE_UP_SIZE_FACTOR = 1.65;
    const ENEMY_AND_PROJECTILE_SIZE_INCREASE = 1.3; // ATUALIZADO: Fator de 30%

    // --- Geometria do Chão ---
    const floorPath = [
        [0.00, 0.70], [0.05, 0.70], [0.05, 0.74], [0.10, 0.74], [0.10, 0.78],
        [0.15, 0.78], [0.15, 0.82], [0.20, 0.82], [0.20, 0.86], [0.25, 0.86],
        [0.25, 0.90], [0.75, 0.90],
        [0.75, 0.86], [0.80, 0.86], [0.80, 0.82], [0.85, 0.82], [0.85, 0.78],
        [0.90, 0.78], [0.90, 0.74], [0.95, 0.74], [0.95, 0.70], [1.00, 0.70]
    ];
    let floorPoints = [];

    // --- Posições Lógicas ---
    const DEFENSE_LINE_Y = logicalHeight * 0.5 * 0.75;
    const BOSS_LINE_Y = logicalHeight * 0.3 * 0.75;
    const RICOCHET_LINE_Y = logicalHeight * 0.2 * 0.75;
    const SNIPER_LINE_Y = logicalHeight * 0.1 * 0.75;

    // --- CONFIGS DE HORDAS (Tamanhos atualizados) ---
    const ENEMY_SIZE_MOD = SCALE_UP_SIZE_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
    const WAVE_CONFIG = [
        { type: 'basic', color: '#FF4136', hp: Math.floor((72 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.04 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3600, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
        { type: 'basic', color: '#FF4136', hp: Math.floor((90 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3360, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
        { type: 'basic', color: '#FF4136', hp: Math.floor((120 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.2 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3000, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
        { type: 'basic', color: '#FF4136', hp: Math.floor((168 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.28 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2640, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
        { type: 'basic', color: '#FF4136', hp: Math.floor((210 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.36 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((30 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2400, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD }
    ];
    const SNIPER_BASE_CONFIG = {
        type: 'sniper', color: '#00FFFF', hpMultiplier: 0.8, damageMultiplier: 0.5,
        projectileDamageMultiplier: 1.15, shootCooldownMultiplier: 1.30 * 1.2,
        width: (8 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (13 * SCALE_FACTOR) * ENEMY_SIZE_MOD, isSniper: true,
        speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR
    };
    const RICOCHET_CONFIG = {
        type: 'ricochet', color: '#FF69B4', hp: Math.floor((150 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (0.96 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.6 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, projectileDamage: Math.floor((20 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR),
        shootCooldown: 4200, isRicochet: true, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD
    };
    const BOSS_CONFIG = {
        type: 'boss', color: '#FFFFFF', hp: Math.floor((300 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (0.96 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((50 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR),
        projectileDamage: Math.floor((35 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 1440, width: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, isBoss: true
    };
    const WAVE_INTERVAL_TICKS = 10 * 60;

    function getSPScalingFactor(wave) { if (wave <= 1) return 1.0; return 1.0 + Math.min(0.40, (wave - 1) * 0.05); }
    function getSPWaveConfig(wave) { const baseConfig = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1]; const scalingFactor = getSPScalingFactor(wave); return { ...baseConfig, hp: Math.floor(baseConfig.hp * scalingFactor), damage: Math.floor(baseConfig.damage * scalingFactor), projectileDamage: Math.floor(baseConfig.projectileDamage * scalingFactor) }; }
    function getSPRicochetConfig(wave) { const scalingFactor = getSPScalingFactor(wave); return { ...RICOCHET_CONFIG, hp: Math.floor(RICOCHET_CONFIG.hp * scalingFactor), projectileDamage: Math.floor(RICOCHET_CONFIG.projectileDamage * scalingFactor) }; }
    function getSPBossConfig(wave) { const scalingFactor = getSPScalingFactor(wave); return { ...BOSS_CONFIG, hp: Math.floor(BOSS_CONFIG.hp * scalingFactor), damage: Math.floor(BOSS_CONFIG.damage * scalingFactor), projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scalingFactor) }; }

    function drawTrashCan(x, y, width, height, color, aCtx = ctx) {
        const sX = x * scaleX; const sY = y * scaleY; const sWidth = width * scaleX; const sHeight = height * scaleY;
        aCtx.save();
        aCtx.strokeStyle = color; aCtx.shadowColor = color; aCtx.shadowBlur = 15; aCtx.lineWidth = Math.max(1, sWidth / 15);
        const sLidHeight = sHeight * 0.15; const sLidWidth = sWidth * 1.1; const sHandleHeight = sHeight * 0.1; const sHandleWidth = sWidth * 0.4;
        aCtx.beginPath(); aCtx.moveTo(sX, sY + sLidHeight); aCtx.lineTo(sX + sWidth, sY + sLidHeight); aCtx.lineTo(sX + sWidth * 0.9, sY + sHeight); aCtx.lineTo(sX + sWidth * 0.1, sY + sHeight); aCtx.closePath(); aCtx.stroke();
        aCtx.strokeRect(sX - (sLidWidth - sWidth) / 2, sY, sLidWidth, sLidHeight);
        aCtx.strokeRect(sX + (sWidth - sHandleWidth) / 2, sY - sHandleHeight, sHandleWidth, sHandleHeight);
        aCtx.restore();
    }
    
    // --- CLASSES DO JOGO ---
    class Ally { /* ... (sem alterações) ... */ }
    class Player {
        constructor(x, y, name = "Player", color = NEON_GREEN) {
            this.name = name; this.x = x; this.y = y;
            this.color = color;
            // ATUALIZADO: Tamanho do jogador mantido como no arquivo original
            this.width = (16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR; 
            this.height = (22 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;
            this.velocityY = 0;
            this.speed = (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR;
            this.jumpForce = 12 * SCALE_FACTOR;
            this.onGround = false;
            this.maxHp = Math.floor((300 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR); 
            this.hp = this.maxHp;
            this.shootCooldown = 300;
            this.bulletDamage = Math.floor((70 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR);
            this.isInvincible = false; this.invincibleTime = 500;
            this.exp = 0; this.level = 1; this.expToNextLevel = 100;
            this.rerolls = 1;
            this.lastShootTime = 0;
            this.bulletSpeed = (18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR;
            this.cadenceUpgrades = 0; this.ally = null; this.allyCooldownWave = 0;
            this.hasLightning = false; this.nextLightningTime = 0;
            this.hasTotalReaction = false; this.totalReactionReady = false; this.totalReactionCooldown = 3;
            this.currentReactionCooldown = 0;
            this.hasCorpseExplosion = false;
            this.corpseExplosionLevel = 0;
            // ATUALIZADO: Lógica do escudo
            this.shield = {
                active: false,
                hp: 0,
                maxHp: 2250, 
                baseRadius: this.width * 0.8, // Raio proporcional ao jogador
                auraFlicker: 0
            };
        }

        drawShield() {
            // ATUALIZADO: O raio do escudo aumenta se o jogador tiver um aliado
            const currentRadius = this.ally ? this.shield.baseRadius * 1.8 : this.shield.baseRadius;
            const sCenterX = (this.x + this.width / 2) * scaleX;
            const sCenterY = (this.y + this.height / 2) * scaleY;
            const sRadius = currentRadius * Math.min(scaleX, scaleY);

            this.shield.auraFlicker += 0.05;
            const auraSize = 15 + Math.sin(this.shield.auraFlicker) * 5;
            
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = auraSize;
            ctx.beginPath();
            ctx.arc(sCenterX, sCenterY, sRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        draw() {
            if (this.shield.active) this.drawShield();
            const colorToDraw = this.isInvincible ? this.color + '80' : this.color;
            drawTrashCan(this.x, this.y, this.width, this.height, colorToDraw);
            const sX = (this.x + this.width / 2) * scaleX;
            const sY = this.y * scaleY;
            ctx.fillStyle = 'white'; ctx.font = `${12 * Math.min(scaleX, scaleY)}px VT323`;
            ctx.textAlign = 'center'; ctx.fillText(this.name, sX, sY - (8 * scaleY));
            if (this.ally) this.ally.draw();
        }

        update() {
            if (this.shield.active && this.shield.hp <= 0) { this.shield.active = false; }
            this.draw(); 
            if (this.ally) this.ally.update(enemies);
            this.y += this.velocityY;
            if (keys.a.pressed) this.x -= this.speed;
            if (keys.d.pressed) this.x += this.speed;
            if (this.x < 0) this.x = 0;
            if (this.x > logicalWidth - this.width) this.x = logicalWidth - this.width;
            const groundY = getGroundY(this.x + this.width / 2) - this.height;
            if (this.y + this.velocityY >= groundY) { this.velocityY = 0; this.onGround = true; this.y = groundY; } 
            else { this.velocityY += gravity; this.onGround = false; }
        }
        
        jump() { if (this.onGround) { this.velocityY = -this.jumpForce; this.onGround = false; } }

        shoot(angle) {
            const now = Date.now();
            if (now - this.lastShootTime > this.shootCooldown) {
                this.lastShootTime = now;
                const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.bulletSpeed, this.bulletDamage, this.color, 'player');
                projectiles.push(bullet);
                if(isMultiplayer) socket.emit('playerShoot', { x: bullet.x, y: bullet.y, angle: bullet.angle, speed: bullet.speed, damage: bullet.damage, color: this.color });
            }
        }
        
        takeDamage(damage) {
            if (this.isInvincible) return;
            this.hp -= damage;
            if (this.hp < 0) this.hp = 0;
            this.isInvincible = true;
            setTimeout(() => this.isInvincible = false, this.invincibleTime);
            updateUI();
            if (this.hp <= 0 && !isGameOver) endGame();
        }

        addExp(amount) { this.exp += amount; if (this.exp >= this.expToNextLevel) this.levelUp(); updateUI(); }
        levelUp() { this.exp -= this.expToNextLevel; this.level++; this.expToNextLevel = Math.floor(this.expToNextLevel * 1.5); this.hp = this.maxHp; this.rerolls = 1; showUpgradeModal(); }
    }
    class Enemy { /* ... (sem alterações) ... */ }
    class Projectile {
        constructor(x, y, angle, speed, damage, color, owner = 'player', originId = null) {
            this.id = `proj_${Date.now()}_${Math.random()}`;
            this.x = x; this.y = y;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage; this.owner = owner; this.color = color;
            this.originId = originId;
            this.trail = []; this.trailLength = 10;
            // ATUALIZADO: Tamanho do projétil aumentado em 30%
            this.radius = (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
        }

        drawTrail(aCtx = ctx) {
            if (!gameSettings.effectsOn || this.trail.length < 2) return; // Checa configuração
            aCtx.save();
            aCtx.lineCap = 'round'; aCtx.lineJoin = 'round'; aCtx.strokeStyle = this.color; aCtx.shadowColor = this.color; aCtx.shadowBlur = 10;
            const sRadius = this.radius * Math.min(scaleX, scaleY);
            for (let i = 1; i < this.trail.length; i++) {
                const startPoint = this.trail[i-1]; const endPoint = this.trail[i];
                aCtx.globalAlpha = (i / this.trail.length) * 0.8;
                aCtx.lineWidth = sRadius * 1.5 * (i / this.trail.length);
                aCtx.beginPath(); aCtx.moveTo(startPoint.x * scaleX, startPoint.y * scaleY); aCtx.lineTo(endPoint.x * scaleX, endPoint.y * scaleY); aCtx.stroke();
            }
            aCtx.restore();
        }
        draw(aCtx = ctx) { /* ... (sem alterações) ... */ }
        update(aCtx = ctx) { /* ... (sem alterações) ... */ }
    }
    
    // --- FUNÇÕES DO JOGO ---
    function cleanup() { if (animationFrameId) cancelAnimationFrame(animationFrameId); if (socket) socket.disconnect(); animationFrameId = null; socket = null; isGameRunning = false; isPaused = false; }
    function returnToMenu() { cleanup(); gameOverModal.style.display = 'none'; appWrapper.style.display = 'none'; mainMenu.style.display = 'flex'; totalReactionBtn.style.display = 'none'; isGameRunning = false; }

    function init() {
        cleanup(); isGameOver = false; gameTime = 0;
        lastFrameTime = 0; // Reseta o tempo do frame para o controle de FPS
        resizeCanvas();
        player = new Player(logicalWidth / 2, logicalHeight - 200, playerName);
        projectiles = []; enemies = []; enemyProjectiles = []; lightningStrikes = []; otherPlayers = {};
        reflectedProjectiles = [];
        spState = { wave: 0, waveState: 'intermission', waveTimer: WAVE_INTERVAL_TICKS, classShootingCooldowns: { basic: 0, sniper: 0, ricochet: 0, boss: 0 } };
        updateUI(); gameOverModal.style.display = 'none';
        if (isMultiplayer) { connectMultiplayer(); pauseBtn.style.display = 'none'; } 
        else { pauseBtn.style.display = 'block'; pauseBtn.textContent = '❚❚'; }
    }
    
    function resizeCanvas() { /* ... (sem alterações) ... */ }

    function startGame(multiplayer) {
        playerName = playerNameInput.value || "Anônimo";
        isMultiplayer = multiplayer;
        mainMenu.style.display = 'none';
        appWrapper.style.display = 'flex';
        init(); isGameRunning = true; 
        requestAnimationFrame(animate); // Inicia o loop de animação
    }
    
    function createCorpseExplosion(enemy) {
        if (!player || !player.hasCorpseExplosion) return;
        const numProjectiles = 8;
        const baseDamage = Math.floor(200 * SCALE_DOWN_ATTR_FACTOR);
        // ATUALIZADO: Dano escalado com 5% por nível
        const damage = baseDamage * (1 + (player.corpseExplosionLevel - 1) * 0.05);
        for (let i = 0; i < numProjectiles; i++) {
            const angle = (i / numProjectiles) * Math.PI * 2;
            const bullet = new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, (12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage, '#FFA500', 'corpse_explosion');
            projectiles.push(bullet);
        }
    }

    function connectMultiplayer() { /* ... (sem alterações, a lógica de tamanho é tratada no client-side) ... */ }
    function handleAimingAndShooting() { /* ... (sem alterações) ... */ }
    function drawNewFloor() { /* ... (sem alterações) ... */ }
    function getGroundY(x) { /* ... (sem alterações) ... */ }
    function drawLightning(x, width) { /* ... (sem alterações) ... */ }
    function initBackground() { /* ... (sem alterações) ... */ }
    function animateBackground() { /* ... (sem alterações) ... */ }
    function drawGameBackground() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawNewFloor(); }
    function updateSPLightning() { /* ... (sem alterações) ... */ }
    function shootForSPEnemy(enemy) { /* ... (sem alterações) ... */ }
    function updateSinglePlayerLogic() { /* ... (sem alterações) ... */ }

    function gameLoop() {
        if (isPaused) return;
        gameTime++;
        drawGameBackground();
        
        const isAiming = (aimStick.active || mouse.down);
        if (isAiming && player) {
            let currentAimAngle = aimStick.active ? aimStick.angle : Math.atan2(mouse.y - (player.y + player.height / 2), mouse.x - (player.x + player.width / 2));
            ctx.save();
            ctx.beginPath();
            ctx.moveTo((player.x + player.width / 2) * scaleX, (player.y + player.height / 2) * scaleY);
            ctx.lineTo((player.x + player.width / 2 + Math.cos(currentAimAngle) * 2000) * scaleX, (player.y + player.height / 2 + Math.sin(currentAimAngle) * 2000) * scaleY);
            ctx.strokeStyle = `rgba(0, 255, 127, ${gameSettings.aimOpacity / 100})`; // Usa opacidade da mira
            ctx.lineWidth = 2 * Math.min(scaleX, scaleY);
            ctx.stroke();
            ctx.restore();
        }

        if (!isMultiplayer) updateSinglePlayerLogic();
        else if (socket) socket.emit('playerUpdate', { x: player.x, y: player.y, hp: player.hp, name: player.name });

        player.update();
        handleAimingAndShooting();
        Object.values(otherPlayers).forEach(p => p.draw());
        lightningStrikes.forEach(strike => { for(let i=0; i<3; i++) drawLightning(strike.x, strike.width); });
        
        // ... (resto do loop de renderização e projéteis)
        projectiles.forEach((p, i) => { p.update(); if (p.x < 0 || p.x > logicalWidth || p.y < 0 || p.y > logicalHeight) projectiles.splice(i, 1); });
        reflectedProjectiles.forEach((p, i) => { p.update(); if (p.x < 0 || p.x > logicalWidth || p.y < 0 || p.y > logicalHeight) { reflectedProjectiles.splice(i, 1); } });
        enemyProjectiles.forEach((p, i) => {
            if (!isMultiplayer) { p.update(); } else { p.draw(); }
            if (p.x < -50 || p.x > logicalWidth+50 || p.y < -50 || p.y > logicalHeight+50) { if (!isMultiplayer) enemyProjectiles.splice(i, 1); }
        });

        // --- LÓGICA DE COLISÃO ---
        // ... (reactionBlade, projéteis refletidos, etc., sem alterações)

        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            
            if (player.shield.active) {
                // ATUALIZADO: Usa raio dinâmico do escudo para colisão
                const currentRadius = player.ally ? player.shield.baseRadius * 1.8 : player.shield.baseRadius;
                const dx = p.x - (player.x + player.width / 2);
                const dy = p.y - (player.y + player.height / 2);
                if (Math.hypot(dx, dy) < currentRadius + p.radius) {
                    player.shield.hp -= p.damage;
                    if (isMultiplayer && socket) socket.emit('enemyProjectileDestroyed', p.id);
                    if (!isMultiplayer) enemyProjectiles.splice(i, 1);
                    continue;
                }
            }

            if (checkCollision(player, p)) { player.takeDamage(p.damage); if (!isMultiplayer) enemyProjectiles.splice(i, 1); } 
            else if (player.ally && checkCollision(player.ally, p)) { player.ally.takeDamage(p.damage); if (!isMultiplayer) enemyProjectiles.splice(i, 1); }
        }

        enemies.forEach((enemy) => {
            enemy.update();
            if (checkCollision(player, enemy)) player.takeDamage(enemy.damage);
            if (player.ally && checkCollision(player.ally, enemy)) player.ally.takeDamage(enemy.damage);

            for (let projIndex = projectiles.length - 1; projIndex >= 0; projIndex--) {
                const proj = projectiles[projIndex];
                if((proj.owner === 'player' || proj.owner === 'other_player' || proj.owner === 'corpse_explosion') && checkCollision(proj, enemy)) {
                    if (isMultiplayer) { socket.emit('enemyHit', { enemyId: enemy.id, damage: proj.damage }); } 
                    else {
                        enemy.hp -= proj.damage;
                        if(enemy.hp <= 0) {
                            if(proj.owner !== 'corpse_explosion') { createCorpseExplosion(enemy); }
                            const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                            setTimeout(() => { const currentIndex = enemies.findIndex(e => e.id === enemy.id); if (currentIndex !== -1) { enemies.splice(currentIndex, 1); player.addExp(expGain); } }, 0);
                        }
                    }
                    projectiles.splice(projIndex, 1);
                }
            }
        });
        
        updateUI();
    }

    function animate(currentTime) {
        if (isGameOver) { cleanup(); return; }
        animationFrameId = requestAnimationFrame(animate);

        const deltaTime = currentTime - lastFrameTime;
        if (deltaTime < targetInterval) {
            return; // Pula este frame se não for a hora (controle de FPS)
        }
        lastFrameTime = currentTime - (deltaTime % targetInterval);
        
        gameLoop();
    }

    function checkCollision(obj1, obj2) { /* ... (sem alterações) ... */ }
    function updateUI() { /* ... (sem alterações) ... */ }
    async function endGame() { /* ... (sem alterações) ... */ }

    function showUpgradeModal() {
        isPaused = true; upgradeOptionsContainer.innerHTML = '';
        rerollUpgradesBtn.textContent = `Trocar Opções (${player.rerolls}/1)`;
        rerollUpgradesBtn.disabled = player.rerolls <= 0;
        const currentWave = spState.wave;
        
        const corpseExplosionBaseDamage = Math.floor(200 * SCALE_DOWN_ATTR_FACTOR);
        // ATUALIZADO: Dano escalado com 5%
        const corpseExplosionNextLevelDamage = corpseExplosionBaseDamage * (1 + (player.corpseExplosionLevel) * 0.05);

        const allUpgrades = [
            { name: "Cadência Rápida", desc: "+10% velocidade de tiro", apply: p => { p.shootCooldown *= 0.90; p.cadenceUpgrades++; }, available: p => p.cadenceUpgrades < 4 },
            { name: "Bala Potente", desc: "+20% dano", apply: p => p.bulletDamage = Math.ceil(p.bulletDamage * 1.2), available: () => true },
            { name: "Pele de Aço", desc: `+${Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR)} HP máximo`, apply: p => { p.maxHp += Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR); p.hp += Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR); }, available: () => true },
            { name: "Velocista", desc: "+10% velocidade de mov.", apply: p => p.speed *= 1.1, available: () => true },
            { name: "Kit Médico", desc: "Cura 50% da vida máxima", apply: p => p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5), available: () => true },
            { name: "Chame um Amigo", desc: "Cria um ajudante que atira.", apply: p => { p.ally = new Ally(p); if(isMultiplayer) socket.emit('playerGotAlly'); }, available: p => currentWave >= 4 && !p.ally && currentWave >= p.allyCooldownWave },
            { 
                name: player.hasCorpseExplosion ? "Aprimorar Corpo Explosivo" : "Corpo Explosivo", 
                desc: player.hasCorpseExplosion ? `Inimigos explodem em projéteis. Dano aumentado para ${Math.floor(corpseExplosionNextLevelDamage)} (+5%).` : `Inimigos explodem ao morrer (${corpseExplosionBaseDamage} de dano).`,
                apply: p => { p.hasCorpseExplosion = true; p.corpseExplosionLevel++; if(isMultiplayer) socket.emit('playerGotCorpseExplosion', { level: p.corpseExplosionLevel }); },
                available: p => currentWave >= 4 && p.corpseExplosionLevel < 5
            },
            { name: "Fúria dos Céus", desc: "A cada 9s, 3 raios caem do céu. Efeito permanente.", apply: p => { p.hasLightning = true; if(isMultiplayer) socket.emit('playerGotLightning'); }, available: p => currentWave >= 8 && !p.hasLightning },
            { // ATUALIZADO: Lógica do upgrade de escudo
                name: player.shield.active ? "Restaurar Escudo" : "Escudo Mágico",
                desc: player.shield.active ? "Restaura 500 de HP do seu escudo." : "Cria um escudo com 2250 de vida.",
                apply: p => {
                    if (p.shield.active) {
                        p.shield.hp = Math.min(p.shield.maxHp, p.shield.hp + 500);
                    } else {
                        p.shield.active = true;
                        p.shield.hp = p.shield.maxHp;
                    }
                },
                available: p => currentWave >= 5
            },
            { name: "Reação Total", desc: "Lâmina que reflete projéteis (300% dano) e corta inimigos (70% da vida máx.). CD: 3 hordas.", apply: p => { p.hasTotalReaction = true; p.totalReactionReady = true; if(isMultiplayer) socket.emit('playerGotTotalReaction'); }, available: p => currentWave >= 13 && !p.hasTotalReaction }
        ];

        const availableOptions = allUpgrades.filter(upg => upg.available(player));
        const options = [...availableOptions].sort(() => 0.5 - Math.random()).slice(0, 4);
        options.forEach(upgrade => { const card = document.createElement('div'); card.className = 'upgrade-card'; card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`; card.onclick = () => selectUpgrade(upgrade); upgradeOptionsContainer.appendChild(card); });
        upgradeModal.style.display = 'flex';
    }

    function selectUpgrade(upgrade) { upgrade.apply(player); upgradeModal.style.display = 'none'; isPaused = false; }

    // --- ATUALIZADO: Funções de Configurações ---
    function loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('neonOutbreakSettings'));
        const defaults = { fps: 60, effectsOn: true, uiOpacity: 100, aimOpacity: 40 };
        gameSettings = { ...defaults, ...savedSettings };
        applySettings();
    }

    function saveSettings() {
        localStorage.setItem('neonOutbreakSettings', JSON.stringify(gameSettings));
    }

    function applySettings() {
        targetInterval = 1000 / gameSettings.fps;
        document.documentElement.style.setProperty('--ui-opacity', gameSettings.uiOpacity / 100);
    }

    function updateSettingsUI() {
        document.querySelectorAll('#fpsSelector button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.fps) === gameSettings.fps));
        effectsToggle.checked = gameSettings.effectsOn;
        uiOpacitySlider.value = gameSettings.uiOpacity;
        uiOpacityValue.textContent = `${gameSettings.uiOpacity}%`;
        aimOpacitySlider.value = gameSettings.aimOpacity;
        aimOpacityValue.textContent = `${gameSettings.aimOpacity}%`;
    }

    // --- EVENT LISTENERS ---
    /* ... (ouvintes de teclado e mouse sem alterações) ... */
    setupTouchControls();
    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => startGame(isMultiplayer));
    backToMenuBtn.addEventListener('click', returnToMenu);
    quitBtn.addEventListener('click', returnToMenu);
    pauseBtn.addEventListener('click', () => { if (isMultiplayer) return; isPaused = !isPaused; pauseBtn.textContent = isPaused ? '▶' : '❚❚'; });
    rerollUpgradesBtn.addEventListener('click', () => { if (player && player.rerolls > 0) { player.rerolls--; showUpgradeModal(); } });
    totalReactionBtn.addEventListener('click', () => { if (player && player.totalReactionReady) { player.totalReactionReady = false; player.currentReactionCooldown = player.totalReactionCooldown + 1; reactionBlade = { active: true, x: 0, y: player.y, width: player.width, height: 15, hitEnemies: [] }; if (isMultiplayer) socket.emit('playerUsedTotalReaction'); updateUI(); } });
    showRankingBtn.addEventListener('click', async () => { /* ... (sem alterações) ... */ });
    closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');

    // --- ATUALIZADO: Listeners para o Modal de Configurações ---
    settingsBtn.addEventListener('click', () => { updateSettingsUI(); settingsModal.style.display = 'flex'; });
    saveSettingsBtn.addEventListener('click', () => { saveSettings(); applySettings(); settingsModal.style.display = 'none'; });
    fpsSelector.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') { gameSettings.fps = parseInt(e.target.dataset.fps); updateSettingsUI(); } });
    effectsToggle.addEventListener('change', (e) => { gameSettings.effectsOn = e.target.checked; });
    uiOpacitySlider.addEventListener('input', (e) => { gameSettings.uiOpacity = parseInt(e.target.value); uiOpacityValue.textContent = `${gameSettings.uiOpacity}%`; document.documentElement.style.setProperty('--ui-opacity', gameSettings.uiOpacity / 100); });
    aimOpacitySlider.addEventListener('input', (e) => { gameSettings.aimOpacity = parseInt(e.target.value); aimOpacityValue.textContent = `${gameSettings.aimOpacity}%`; });

    // --- Inicialização ---
    loadSettings();
    initBackground();
    animateBackground();
});
