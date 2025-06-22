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

    // --- Elementos do Modal de Configurações ---
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
    const ENEMY_AND_PROJECTILE_SIZE_INCREASE = 1.3;

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

    // --- CONFIGS DE HORDAS (Com tamanhos aumentados) ---
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
        type: 'boss', color: '#FFFFFF', hp: Math.floor((300 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR) + 80, speed: (0.96 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((50 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR),
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
    class Ally { 
        constructor(owner) {
            this.owner = owner;
            this.width = owner.width / 1.5;
            this.height = owner.height / 1.5;
            this.x = 0;
            this.y = 0;
            this.maxHp = owner.maxHp / 2;
            this.hp = this.maxHp;
            this.lastShootTime = 0;
            this.isInvincible = false;
        }
        draw() {
            const color = this.isInvincible ? 'rgba(255, 255, 255, 0.4)' : '#FFFFFF';
            drawTrashCan(this.x, this.y, this.width, this.height, color);
        }
        update(enemyList) {
            this.x = this.owner.x - this.width - 10;
            this.y = this.owner.y;
            let nearestEnemy = null;
            let minDistance = Infinity;
            enemyList.forEach(enemy => {
                const distance = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                if (distance < minDistance) { minDistance = distance; nearestEnemy = enemy; }
            });
            if (nearestEnemy) this.shoot(nearestEnemy);
            this.draw();
        }
        shoot(target) {
            const now = Date.now();
            if (now - this.lastShootTime > this.owner.shootCooldown * 1.5) {
                this.lastShootTime = now;
                const angle = Math.atan2((target.y + target.height / 2) - (this.y + this.height / 2), (target.x + target.width / 2) - (this.x + this.width / 2));
                
                // ATUALIZADO: Em multiplayer, a criação de projéteis é delegada ao dono do aliado.
                if (isMultiplayer) {
                    if (this.owner.id === player.id) { // Só o jogador dono do aliado pode emitir o tiro.
                         socket.emit('playerShoot', { 
                            x: this.x + this.width / 2, 
                            y: this.y + this.height / 2, 
                            angle: angle, 
                            speed: this.owner.bulletSpeed, 
                            damage: this.owner.bulletDamage / 2, 
                            color: '#FFFFFF'
                        });
                    }
                } else {
                    const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.owner.bulletSpeed, this.owner.bulletDamage / 2, '#FFFFFF', 'player');
                    projectiles.push(bullet);
                }
            }
        }
        takeDamage(damage) {
            if (this.isInvincible) return;
            this.hp -= damage;
            this.isInvincible = true;
            setTimeout(() => this.isInvincible = false, 500);
            if (this.hp <= 0) {
                this.owner.ally = null;
                this.owner.allyCooldownWave = spState.wave + 2;
                if(isMultiplayer) socket.emit('playerLostAlly');
            }
        }
    }
    class Player {
        constructor(x, y, name = "Player", color = NEON_GREEN) {
            this.name = name; this.x = x; this.y = y;
            this.color = color;
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
            this.shield = {
                active: false,
                hp: 0,
                maxHp: 2250, 
                baseRadius: this.width * 0.8 * 1.1,
                auraFlicker: 0
            };
        }

        drawShield() {
            if(!this.shield.active) return;
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
            this.drawShield();
            const colorToDraw = this.isInvincible ? this.color + '80' : this.color;
            drawTrashCan(this.x, this.y, this.width, this.height, colorToDraw);
            const sX = (this.x + this.width / 2) * scaleX;
            const sY = this.y * scaleY;
            ctx.fillStyle = 'white'; 
            // ATUALIZADO: Tamanho da fonte aumentado em 700% (16 * 7 = 112) e offset ajustado
            ctx.font = `${112 * Math.min(scaleX, scaleY)}px VT323`;
            ctx.textAlign = 'center'; 
            ctx.fillText(this.name, sX, sY - (25 * scaleY));
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
                
                // ATUALIZAÇÃO: Lógica dividida para single-player e multiplayer
                if (isMultiplayer) {
                    // Em multiplayer, apenas emitimos o evento. O servidor cria o projétil.
                    socket.emit('playerShoot', { 
                        x: this.x + this.width / 2, 
                        y: this.y + this.height / 2, 
                        angle: angle, 
                        speed: this.bulletSpeed, 
                        damage: this.bulletDamage, 
                        color: this.color 
                    });
                } else {
                    // Em single-player, criamos o projétil localmente.
                    const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.bulletSpeed, this.bulletDamage, this.color, 'player');
                    projectiles.push(bullet);
                }
            }
        }
        
        takeDamage(damage) {
            if (this.isInvincible) return;

            if(this.shield.active && this.shield.hp > 0) {
                this.shield.hp -= damage;
                if(this.shield.hp <= 0) {
                    this.shield.active = false;
                }
                updateUI();
                return;
            }

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
    class Enemy { 
        constructor(config) {
            Object.assign(this, config); this.maxHp = config.hp; this.patrolOriginX = null; this.reachedPosition = false; this.baseY = 0;
        }
        draw() {
            const sX = this.x * scaleX; const sY = this.y * scaleY; const sWidth = this.width * scaleX; const sHeight = this.height * scaleY;
            ctx.save(); ctx.strokeStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.lineWidth = Math.max(1, sWidth / 15); ctx.strokeRect(sX, sY, sWidth, sHeight); ctx.restore();
            const hpRatio = this.hp / this.maxHp; const barY = sY - (8 * scaleY); const barHeight = 3 * scaleY;
            ctx.fillStyle = '#555'; ctx.fillRect(sX, barY, sWidth, barHeight);
            ctx.fillStyle = hpRatio > 0.5 ? 'lightgreen' : hpRatio > 0.2 ? 'gold' : 'red'; ctx.fillRect(sX, barY, sWidth * hpRatio, barHeight);
        }
        update() {
            if (!isMultiplayer) {
                let targetY;
                if (this.isSniper) targetY = SNIPER_LINE_Y; else if (this.isRicochet) targetY = RICOCHET_LINE_Y; else if (this.isBoss) targetY = BOSS_LINE_Y; else targetY = DEFENSE_LINE_Y;
                if (!this.reachedPosition) { if (this.y < targetY) { this.y += this.speed; } else { this.y = targetY; this.baseY = targetY; this.reachedPosition = true; this.patrolOriginX = this.x; } } 
                else {
                    if (this.baseY) { const phase = (this.id.charCodeAt(this.id.length - 1) || 0) % (Math.PI * 2); this.y = this.baseY + Math.sin(gameTime * 0.05 + phase) * 5; }
                    const patrolSpeed = this.horizontalSpeed || this.speed / 2;
                    if (!this.isRicochet) { const moveDirection = Math.sign(player.x - this.x); this.x += moveDirection * patrolSpeed; }
                    const patrolRange = logicalWidth * (this.isBoss ? 0.3 : 0.1); const leftBoundary = this.patrolOriginX - (patrolRange / 2); const rightBoundary = this.patrolOriginX + (patrolRange / 2);
                    if (this.x < leftBoundary) this.x = leftBoundary; if (this.x > rightBoundary - this.width) this.x = rightBoundary - this.width;
                }
                if (this.x < 0) this.x = 0; if (this.x > logicalWidth - this.width) this.x = logicalWidth - this.width;
            }
            this.draw();
        }
    }
    class Projectile {
        constructor(x, y, angle, speed, damage, color, owner = 'player', originId = null) {
            this.id = `proj_${Date.now()}_${Math.random()}`;
            this.x = x; this.y = y;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage; this.owner = owner; this.color = color;
            this.originId = originId;
            this.trail = []; this.trailLength = 10;
            this.radius = (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
        }
        drawTrail(aCtx = ctx) {
            if (!gameSettings.effectsOn || this.trail.length < 2) return;
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
        draw(aCtx = ctx) {
            this.drawTrail(aCtx);
            const sX = this.x * scaleX; const sY = this.y * scaleY; const sRadius = this.radius * Math.min(scaleX, scaleY);
            aCtx.beginPath(); aCtx.arc(sX, sY, sRadius, 0, Math.PI * 2); aCtx.fillStyle = this.color;
            aCtx.shadowColor = this.color; aCtx.shadowBlur = 5; aCtx.fill(); aCtx.shadowBlur = 0;
        }
        update(aCtx = ctx) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailLength) this.trail.shift();
            this.x += this.velocity.x; this.y += this.velocity.y;
            this.draw(aCtx);
        }
    }
    
    // --- FUNÇÕES DO JOGO ---
    function cleanup() { if (animationFrameId) cancelAnimationFrame(animationFrameId); if (socket) socket.disconnect(); animationFrameId = null; socket = null; isGameRunning = false; isPaused = false; }
    function returnToMenu() { cleanup(); gameOverModal.style.display = 'none'; appWrapper.style.display = 'none'; mainMenu.style.display = 'flex'; totalReactionBtn.style.display = 'none'; isGameRunning = false; }

    function init() {
        cleanup(); isGameOver = false; gameTime = 0;
        lastFrameTime = 0;
        resizeCanvas();
        player = new Player(logicalWidth / 2, logicalHeight - 200, playerName);
        projectiles = []; enemies = []; enemyProjectiles = []; lightningStrikes = []; otherPlayers = {};
        reflectedProjectiles = [];
        spState = { wave: 0, waveState: 'intermission', waveTimer: WAVE_INTERVAL_TICKS, classShootingCooldowns: { basic: 0, sniper: 0, ricochet: 0, boss: 0 } };
        updateUI(); gameOverModal.style.display = 'none';
        if (isMultiplayer) { connectMultiplayer(); pauseBtn.style.display = 'none'; } 
        else { pauseBtn.style.display = 'block'; pauseBtn.textContent = '❚❚'; }
    }
    
    function resizeCanvas() {
        backgroundCanvas.width = window.innerWidth; backgroundCanvas.height = window.innerHeight;
        const gameRect = gameContainer.getBoundingClientRect();
        canvas.width = gameRect.width; canvas.height = gameRect.height;
        scaleX = canvas.width / logicalWidth; scaleY = canvas.height / logicalHeight;
        floorPoints = floorPath.map(p => ({ x: p[0] * logicalWidth, y: p[1] * logicalHeight }));
    }

    function startGame(multiplayer) {
        playerName = playerNameInput.value || "Anônimo";
        isMultiplayer = multiplayer;
        mainMenu.style.display = 'none';
        appWrapper.style.display = 'flex';
        init(); isGameRunning = true; 
        requestAnimationFrame(animate);
    }
    
    function createCorpseExplosion(enemy) {
        if (!player || !player.hasCorpseExplosion) return;
        const numProjectiles = 8;
        const baseDamage = Math.floor(200 * SCALE_DOWN_ATTR_FACTOR);
        const damage = baseDamage * (1 + (player.corpseExplosionLevel - 1) * 0.05);
        for (let i = 0; i < numProjectiles; i++) {
            const angle = (i / numProjectiles) * Math.PI * 2;
            projectiles.push(new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, (12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage, '#FFA500', 'corpse_explosion'));
        }
    }

    function connectMultiplayer() {
        socket = io();
        socket.on('connect', () => socket.emit('joinMultiplayer', { name: player.name, x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp, width: player.width, height: player.height }));
        socket.on('waveStart', (wave) => { spState.wave = wave; });
        socket.on('gameState', (state) => {
            if (!isGameRunning) return;
            gameTime = state.gameTime; spState.wave = state.wave; spState.waveState = state.waveState; spState.waveTimer = state.waveTimer * 60;
            const serverEnemyIds = state.enemies.map(e => e.id); enemies = enemies.filter(e => serverEnemyIds.includes(e.id));
            state.enemies.forEach(eData => { let enemy = enemies.find(e => e.id === eData.id); if (enemy) { Object.assign(enemy, eData); } else { enemies.push(new Enemy({ ...eData })); } });
            lightningStrikes = state.lightningStrikes;

            // ATUALIZAÇÃO: Sincroniza os projéteis dos jogadores (servidor é a fonte da verdade)
            if (state.playerProjectiles) {
                const serverProjIds = new Set(state.playerProjectiles.map(p => p.id));
                projectiles = projectiles.filter(p => serverProjIds.has(p.id));

                state.playerProjectiles.forEach(pData => {
                    let p = projectiles.find(proj => proj.id === pData.id);
                    if (p) {
                        p.x = pData.x;
                        p.y = pData.y;
                    } else {
                        const newProj = new Projectile(pData.x, pData.y, 0, 0, pData.damage, pData.color, pData.ownerId);
                        newProj.id = pData.id;
                        newProj.velocity = {x: 0, y: 0}; 
                        projectiles.push(newProj);
                    }
                });
            }

            const serverProjectileIds = new Set(state.enemyProjectiles.map(p => p.id)); enemyProjectiles = enemyProjectiles.filter(ep => serverProjectileIds.has(ep.id));
            state.enemyProjectiles.forEach(pData => {
                let p = enemyProjectiles.find(ep => ep.id === pData.id);
                if (!p) { const newProj = new Projectile(pData.x, pData.y, 0, 0, pData.damage, pData.color, 'enemy', pData.originId); newProj.id = pData.id; newProj.velocity.x = pData.vx; newProj.velocity.y = pData.vy; newProj.radius = pData.radius; enemyProjectiles.push(newProj); } 
                else { p.x = pData.x; p.y = pData.y; }
            });
            
            const currentOtherPlayerIds = new Set();
            for(const id in state.players) {
                const pData = state.players[id];
                if (id === socket.id) {
                    Object.assign(player, pData, { x: player.x, y: player.y });
                    if(pData.hasAlly && !player.ally) player.ally = new Ally(player);
                    if(!pData.hasAlly && player.ally) player.ally = null;
                    continue;
                }
                currentOtherPlayerIds.add(id);
                if(!otherPlayers[id]) { 
                    otherPlayers[id] = new Player(pData.x, pData.y, pData.name, pData.color); 
                }
                Object.assign(otherPlayers[id], pData);
                if (pData.hasAlly && !otherPlayers[id].ally) { otherPlayers[id].ally = new Ally(otherPlayers[id]); } 
                else if (!pData.hasAlly && otherPlayers[id].ally) { otherPlayers[id].ally = null; }
            }
             Object.keys(otherPlayers).forEach(id => {
                if (!currentOtherPlayerIds.has(id)) {
                    delete otherPlayers[id];
                }
            });
        });
        socket.on('playerHit', (damage) => player.takeDamage(damage));
        
        // ATUALIZADO: Adicionado listener para dano no aliado
        socket.on('allyHit', (damage) => {
            if (player && player.ally) {
                player.ally.takeDamage(damage);
            }
        });
        
        socket.on('enemyDied', ({ enemyId, killerId, expGain }) => {
            const enemy = enemies.find(e => e.id === enemyId);
            if (enemy) { 
                const killerPlayer = killerId === socket.id ? player : otherPlayers[killerId]; 
                if (killerPlayer && killerPlayer.hasCorpseExplosion) { createCorpseExplosion(enemy); } 
            }
            enemies = enemies.filter(e => e.id !== enemyId); if(killerId === socket.id) player.addExp(expGain);
        });
        socket.on('playerLeft', (id) => delete otherPlayers[id]);
    }
    function handleAimingAndShooting() {
        const isAiming = aimStick.active || mouse.down;
        if (isAiming && player) {
            const angle = aimStick.active ? aimStick.angle : Math.atan2(mouse.y - (player.y + player.height / 2), mouse.x - (player.x + player.width / 2));
            player.shoot(angle);
        }
    }
    function drawNewFloor() {
        if (floorPoints.length === 0) return;
        ctx.save(); ctx.strokeStyle = NEON_GREEN; ctx.lineWidth = 4; ctx.shadowColor = NEON_GREEN; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(floorPoints[0].x * scaleX, floorPoints[0].y * scaleY);
        for (let i = 1; i < floorPoints.length; i++) { ctx.lineTo(floorPoints[i].x * scaleX, floorPoints[i].y * scaleY); }
        ctx.stroke();
        ctx.lineWidth = 2; ctx.shadowBlur = 5;
        const flatPart = floorPoints.slice(10, 12); const dripCount = 20;
        for (let i = 0; i <= dripCount; i++) {
            const ratio = i / dripCount; const x = flatPart[0].x + (flatPart[1].x - flatPart[0].x) * ratio; const y = flatPart[0].y; const dripLength = 10 + Math.sin(i * 0.8) * 5 + Math.random() * 10;
            ctx.beginPath(); ctx.moveTo(x * scaleX, y * scaleY); ctx.lineTo(x * scaleX, (y + dripLength) * scaleY); ctx.stroke();
        }
        ctx.restore();
    }
    function getGroundY(x) {
        if (floorPoints.length < 2) return logicalHeight;
        for (let i = 0; i < floorPoints.length - 1; i++) {
            const p1 = floorPoints[i]; const p2 = floorPoints[i+1];
            if (x >= p1.x && x <= p2.x) { if (p1.x === p2.x) return Math.min(p1.y, p2.y); const slope = (p2.y - p1.y) / (p2.x - p1.x); return p1.y + slope * (x - p1.x); }
        }
        return x < floorPoints[0].x ? floorPoints[0].y : floorPoints[floorPoints.length - 1].y;
    }
    function drawLightning(x, width) {
        const sX = x * scaleX; const sWidth = width * scaleX;
        ctx.save(); ctx.shadowColor = '#8A2BE2'; ctx.shadowBlur = 25; ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + Math.random() * 0.5})`;
        ctx.lineWidth = (1 + Math.random() * 4) * Math.min(scaleX, scaleY); ctx.beginPath();
        let currentY = 0; let currentX = sX; ctx.moveTo(currentX, currentY);
        while(currentY < canvas.height) { const nextY = currentY + (Math.random() * 30 + 20) * scaleY; const nextX = currentX + (Math.random() - 0.5) * sWidth; ctx.lineTo(nextX, nextY); currentY = nextY; currentX = nextX; }
        ctx.stroke(); ctx.restore();
    }
    function initBackground() {
        backgroundOrbs = [];
        for (let i = 0; i < 50; i++) { backgroundOrbs.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, radius: Math.random() * 2 + 1, hue: Math.random() * 360 }); }
    }
    function animateBackground() {
        bgCtx.fillStyle = 'rgba(10, 10, 10, 0.1)'; bgCtx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
        backgroundOrbs.forEach(orb => {
            orb.x += orb.vx; orb.y += orb.vy; orb.hue = (orb.hue + 0.5) % 360;
            if (orb.x < 0 || orb.x > backgroundCanvas.width) orb.vx *= -1; if (orb.y < 0 || orb.y > backgroundCanvas.height) orb.vy *= -1;
            const color = `hsl(${orb.hue}, 100%, 50%)`; bgCtx.beginPath(); bgCtx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            bgCtx.fillStyle = color; bgCtx.shadowColor = color; bgCtx.shadowBlur = 10; bgCtx.fill();
        });
        bgCtx.shadowBlur = 0; requestAnimationFrame(animateBackground);
    }
    function drawGameBackground() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawNewFloor(); }
    function updateSPLightning() {
        const visualDurationTicks = 30; lightningStrikes = lightningStrikes.filter(s => gameTime < s.creationTime + visualDurationTicks);
        if (player.hasLightning && gameTime >= player.nextLightningTime) {
            player.nextLightningTime = gameTime + 9 * 60;
            const lightningDamage = Math.floor(WAVE_CONFIG[0].hp * SCALE_DOWN_ATTR_FACTOR);
            for (let i = 0; i < 3; i++) {
                const strikeX = Math.random() * logicalWidth; const strikeWidth = player.width * 1.2;
                lightningStrikes.push({ x: strikeX, width: strikeWidth, creationTime: gameTime });
                enemies.forEach(enemy => { if (enemy.x + enemy.width > strikeX - strikeWidth / 2 && enemy.x < strikeX + strikeWidth / 2) { enemy.hp -= lightningDamage; } });
            }
            enemies = enemies.filter(e => { if (e.hp <= 0) { createCorpseExplosion(e); player.addExp(e.isBoss ? 1000 : (e.isSniper ? 75 : (e.isRicochet ? 60 : 50))); return false; } return true; });
        }
    }
    function shootForSPEnemy(enemy) {
        if (!player) return; let angle; let speed = (10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR;
        if (enemy.isRicochet) { const wallX = (player.x > enemy.x) ? logicalWidth : 0; const virtualPlayerX = (wallX === 0) ? -player.x : (2 * logicalWidth - player.x); angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (virtualPlayerX + player.width / 2) - (enemy.x + enemy.width / 2)); speed = (14 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR; }
        else { angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (player.x + player.width / 2) - (enemy.x + enemy.width / 2)); if (enemy.isSniper) speed = (16 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR; }
        const newProj = new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, speed, enemy.projectileDamage, enemy.color, 'enemy', enemy.id);
        if (enemy.isRicochet) { newProj.canRicochet = true; newProj.bouncesLeft = 1; }
        enemyProjectiles.push(newProj);
    }
    function updateSinglePlayerLogic() {
        updateSPLightning();
        if (spState.waveState === 'intermission') {
            spState.waveTimer--; if (spState.waveTimer <= 0) {
                spState.wave++; spState.waveState = 'active';
                if (player.hasTotalReaction && player.currentReactionCooldown > 0) { player.currentReactionCooldown--; if (player.currentReactionCooldown <= 0) player.totalReactionReady = true; }
                const waveConfig = getSPWaveConfig(spState.wave); const normalEnemyCount = spState.wave + 1;
                for(let i = 0; i < normalEnemyCount; i++) { setTimeout(() => enemies.push(new Enemy({ ...waveConfig, id: `enemy_${Date.now()}_${i}`, x: Math.random() * (logicalWidth - waveConfig.width), y: -50, horizontalSpeed: waveConfig.speed / 2 })), i * 250); }
                if (spState.wave >= 3) {
                    const sniperCount = 1 + Math.floor((spState.wave - 3) / 2);
                    for (let i = 0; i < sniperCount; i++) {
                        const baseConfig = getSPWaveConfig(spState.wave);
                        const sniperConfig = { ...SNIPER_BASE_CONFIG, id: `sniper_${Date.now()}_${i}`, x: Math.random() * (logicalWidth - SNIPER_BASE_CONFIG.width), y: -50, hp: baseConfig.hp * SNIPER_BASE_CONFIG.hpMultiplier, damage: baseConfig.damage * SNIPER_BASE_CONFIG.damageMultiplier, projectileDamage: baseConfig.projectileDamage * SNIPER_BASE_CONFIG.projectileDamageMultiplier, shootCooldown: baseConfig.shootCooldown * SNIPER_BASE_CONFIG.shootCooldownMultiplier };
                        enemies.push(new Enemy(sniperConfig));
                    }
                }
                if (spState.wave >= 7 && (spState.wave - 7) % 2 === 0) {
                    const ricochetCount = Math.floor((spState.wave - 7) / 2) + 1; const ricochetConfigBase = getSPRicochetConfig(spState.wave);
                    for (let i = 0; i < ricochetCount; i++) { enemies.push(new Enemy({ ...ricochetConfigBase, id: `ricochet_${Date.now()}_${i}`, x: Math.random() * (logicalWidth - ricochetConfigBase.width), y: -50 })); }
                }
                if (spState.wave >= 10 && (spState.wave - 10) % 3 === 0) {
                    const bossCount = Math.floor((spState.wave - 10) / 3) + 1; const bossConfigBase = getSPBossConfig(spState.wave);
                    for (let i = 0; i < bossCount; i++) { enemies.push(new Enemy({ ...bossConfigBase, id: `boss_${Date.now()}_${i}`, x: (logicalWidth / (bossCount + 1)) * (i + 1) - BOSS_CONFIG.width / 2, y: -BOSS_CONFIG.height })); }
                }
            }
        } else if (spState.waveState === 'active' && enemies.length === 0) { spState.waveState = 'intermission'; spState.waveTimer = WAVE_INTERVAL_TICKS; }
        enemies.forEach(enemy => { const now = Date.now(); if (enemy.reachedPosition && now > (enemy.lastShotTime || 0) + enemy.shootCooldown) { const enemyType = enemy.type; if(gameTime >= (spState.classShootingCooldowns[enemyType] || 0)) { shootForSPEnemy(enemy); enemy.lastShotTime = now; spState.classShootingCooldowns[enemyType] = gameTime + ENEMY_SHOOT_DELAY_TICKS; } } });
    }

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
            ctx.strokeStyle = `rgba(0, 255, 127, ${gameSettings.aimOpacity / 100})`;
            ctx.lineWidth = 2 * Math.min(scaleX, scaleY);
            ctx.stroke();
            ctx.restore();
        }

        if (!isMultiplayer) updateSinglePlayerLogic();
        else if (socket) socket.emit('playerUpdate', { x: player.x, y: player.y, hp: player.hp, shield: { active: player.shield.active, hp: player.shield.hp } });

        player.update();
        handleAimingAndShooting();
        Object.values(otherPlayers).forEach(p => p.draw());
        lightningStrikes.forEach(strike => { for(let i=0; i<3; i++) drawLightning(strike.x, strike.width); });
        
        // ATUALIZAÇÃO: Lógica de movimento de projéteis dividida
        projectiles.forEach((p, i) => {
            if (!isMultiplayer) {
                p.update(); // Cliente move em SP
                if (p.x < 0 || p.x > logicalWidth || p.y < 0 || p.y > logicalHeight) {
                    projectiles.splice(i, 1);
                }
            } else {
                p.draw(); // Cliente só desenha em MP, posição vem do servidor
            }
        });
        
        reflectedProjectiles.forEach((p, i) => { p.update(); if (p.x < 0 || p.x > logicalWidth || p.y < 0 || p.y > logicalHeight) { reflectedProjectiles.splice(i, 1); } });
        
        enemyProjectiles.forEach((p, i) => {
            if (!isMultiplayer) { 
                if (p.canRicochet && p.bouncesLeft > 0 && (p.x <= 0 || p.x >= logicalWidth)) {
                    p.velocity.x *= -1;
                    p.bouncesLeft--;
                    p.x = p.x <= 0 ? 1 : logicalWidth - 1;
                }
                p.update(); 
            } else { p.draw(); }
            if (p.x < -50 || p.x > logicalWidth+50 || p.y < -50 || p.y > logicalHeight+50) { if (!isMultiplayer) enemyProjectiles.splice(i, 1); }
        });

        if (reactionBlade.active) {
            reactionBlade.y -= 25; reactionBlade.width += 40; reactionBlade.x = player.x + player.width / 2 - reactionBlade.width / 2;
            ctx.save(); ctx.beginPath(); ctx.moveTo(reactionBlade.x * scaleX, (reactionBlade.y + reactionBlade.height) * scaleY);
            ctx.quadraticCurveTo((reactionBlade.x + reactionBlade.width / 2) * scaleX, (reactionBlade.y - reactionBlade.height * 2) * scaleY, (reactionBlade.x + reactionBlade.width) * scaleX, (reactionBlade.y + reactionBlade.height) * scaleY);
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 10 * Math.min(scaleX, scaleY); ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 25; ctx.stroke(); ctx.restore();
            if (reactionBlade.y < -50) reactionBlade.active = false;
        }

        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            if (reactionBlade.active && checkCollision(p, {x: reactionBlade.x, y: reactionBlade.y, width: reactionBlade.width, height: reactionBlade.height})) {
                const originEnemy = enemies.find(e => e.id === p.originId);
                if (originEnemy) {
                    const angle = Math.atan2(originEnemy.y - p.y, originEnemy.x - p.x);
                    reflectedProjectiles.push(new Projectile(p.x, p.y, angle, (15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, p.damage * 3, '#FFFFFF', 'reflected', originEnemy.id));
                }
                if (isMultiplayer) socket.emit('enemyProjectileDestroyed', p.id);
                if (!isMultiplayer) enemyProjectiles.splice(i, 1);
                continue;
            }
            if (checkCollision(player, p)) { player.takeDamage(p.damage); if (!isMultiplayer) enemyProjectiles.splice(i, 1); } 
            else if (player.ally && checkCollision(player.ally, p)) { player.ally.takeDamage(p.damage); if (!isMultiplayer) enemyProjectiles.splice(i, 1); }
        }

        enemies.forEach((enemy) => {
            enemy.update();
            if (reactionBlade.active && !reactionBlade.hitEnemies.includes(enemy.id) && checkCollision(enemy, {x: reactionBlade.x, y: reactionBlade.y, width: reactionBlade.width, height: reactionBlade.height})) {
                reactionBlade.hitEnemies.push(enemy.id);
                if (isMultiplayer) { socket.emit('bladeHitEnemy', enemy.id); } 
                else {
                    const damage = enemy.maxHp * 0.7; enemy.hp -= damage;
                    if (enemy.hp <= 0) {
                        createCorpseExplosion(enemy);
                        setTimeout(() => { const currentIndex = enemies.findIndex(e => e.id === enemy.id); if (currentIndex !== -1) { enemies.splice(currentIndex, 1); player.addExp(enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50))); } }, 0);
                    }
                }
            }
            if (checkCollision(player, enemy)) player.takeDamage(enemy.damage);
            if (player.ally && checkCollision(player.ally, enemy)) player.ally.takeDamage(enemy.damage);
            
            // ATUALIZAÇÃO: Colisão projétil-inimigo só é checada pelo cliente em single-player
            if (!isMultiplayer) {
                for (let projIndex = projectiles.length - 1; projIndex >= 0; projIndex--) {
                    const proj = projectiles[projIndex];
                    if((proj.owner === 'player' || proj.owner === 'corpse_explosion') && checkCollision(proj, enemy)) {
                        enemy.hp -= proj.damage;
                        if(enemy.hp <= 0) {
                            if(proj.owner !== 'corpse_explosion') createCorpseExplosion(enemy);
                            const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                            setTimeout(() => { const currentIndex = enemies.findIndex(e => e.id === enemy.id); if (currentIndex !== -1) { enemies.splice(currentIndex, 1); player.addExp(expGain); } }, 0);
                        }
                        projectiles.splice(projIndex, 1);
                    }
                }
            }
        });
        
        updateUI();
    }

    function animate(currentTime) {
        if (isGameOver) { cleanup(); return; }
        animationFrameId = requestAnimationFrame(animate);
        const deltaTime = currentTime - lastFrameTime;
        if (deltaTime < targetInterval) return;
        lastFrameTime = currentTime - (deltaTime % targetInterval);
        gameLoop();
    }

    function checkCollision(obj1, obj2) {
        const r1 = obj1.radius || 0; const r2 = obj2.radius || 0; const w1 = obj1.width || 0; const h1 = obj1.height || 0; const w2 = obj2.width || 0; const h2 = obj2.height || 0;
        const obj1Left = obj1.x - r1; const obj1Right = obj1.x + (w1 || r1); const obj1Top = obj1.y - r1; const obj1Bottom = obj1.y + (h1 || r1);
        const obj2Left = obj2.x - r2; const obj2Right = obj2.x + (w2 || r2); const obj2Top = obj2.y - r2; const obj2Bottom = obj2.y + (h2 || r2);
        return (obj1Left < obj2Right && obj1Right > obj2Left && obj1Top < obj2Bottom && obj1Bottom > obj2Top);
    }
    function updateUI() {
        if (!player) return;
        hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`; expBar.style.width = `${(player.exp / player.expToNextLevel) * 100}%`;
        timerDisplay.textContent = `Tempo: ${Math.floor(gameTime/60)}s`;
        if (spState.waveState === 'intermission') { const timer = isMultiplayer ? Math.ceil(spState.waveTimer/60) : Math.ceil(spState.waveTimer / 60); waveDisplay.textContent = `Próxima horda em ${timer}s`; waveDisplay.style.color = "gold"; }
        else { waveDisplay.textContent = `Horda: ${spState.wave}`; waveDisplay.style.color = "white"; }
        if (player.hasTotalReaction) {
            totalReactionBtn.style.display = 'flex'; totalReactionBtn.disabled = !player.totalReactionReady;
            if(!player.totalReactionReady) { totalReactionBtn.textContent = `${player.currentReactionCooldown}`; totalReactionBtn.title = `Disponível em ${player.currentReactionCooldown} horda(s)`; }
            else { totalReactionBtn.textContent = '⚔️'; totalReactionBtn.title = 'Reação Total'; }
        } else { totalReactionBtn.style.display = 'none'; }
        const shieldBarContainer = document.getElementById('shieldBarContainer');
        if (player.shield.active && player.shield.maxHp > 0) { shieldBarContainer.style.display = 'block'; document.getElementById('shieldBar').style.width = `${(player.shield.hp / player.shield.maxHp) * 100}%`; } 
        else { shieldBarContainer.style.display = 'none'; }
    }
    async function endGame() {
        if (isGameOver) return;
        isGameOver = true; isGameRunning = false;
        const finalTimeInSeconds = Math.floor(gameTime / 60);
        finalTimeDisplay.textContent = finalTimeInSeconds;
        finalWaveDisplay.textContent = `${spState.wave}`;
        gameOverModal.style.display = 'flex';
        try {
            // ATUALIZADO: Envia a horda alcançada para o servidor
            await fetch('/api/ranking', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    name: playerName, 
                    timeSurvived: finalTimeInSeconds,
                    waveReached: spState.wave 
                }) 
            });
        } 
        catch (error) { console.error("Falha ao salvar pontuação:", error); }
    }

    function showUpgradeModal() {
        isPaused = true; upgradeOptionsContainer.innerHTML = '';
        rerollUpgradesBtn.textContent = `Trocar Opções (${player.rerolls}/1)`;
        rerollUpgradesBtn.disabled = player.rerolls <= 0;
        const currentWave = spState.wave;
        const corpseExplosionBaseDamage = Math.floor(200 * SCALE_DOWN_ATTR_FACTOR);
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
            {
                name: player.shield.active ? "Restaurar Escudo" : "Escudo Mágico",
                desc: player.shield.active ? "Restaura 500 de HP do seu escudo." : "Cria um escudo com 2250 de vida.",
                apply: p => { if (p.shield.active) { p.shield.hp = Math.min(p.shield.maxHp, p.shield.hp + 500); } else { p.shield.active = true; p.shield.hp = p.shield.maxHp; } },
                available: p => currentWave >= 5
            },
            { name: "Reação Total", desc: "Lâmina que reflete projéteis (300% dano) e corta inimigos (70% da vida máx.). CD: 3 hordas.", apply: p => { p.hasTotalReaction = true; p.totalReactionReady = true; if(isMultiplayer) socket.emit('playerGotTotalReaction'); }, available: p => currentWave >= 13 && !p.hasTotalReaction && (!isMultiplayer || !Object.values(otherPlayers).some(op => op.hasTotalReaction)) }
        ];

        const availableOptions = allUpgrades.filter(upg => upg.available(player));
        const options = [...availableOptions].sort(() => 0.5 - Math.random()).slice(0, 4);
        options.forEach(upgrade => { const card = document.createElement('div'); card.className = 'upgrade-card'; card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`; card.onclick = () => selectUpgrade(upgrade); upgradeOptionsContainer.appendChild(card); });
        upgradeModal.style.display = 'flex';
    }

    function selectUpgrade(upgrade) { upgrade.apply(player); upgradeModal.style.display = 'none'; isPaused = false; }

    function loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('neonOutbreakSettings'));
        const defaults = { fps: 60, effectsOn: true, uiOpacity: 100, aimOpacity: 40 };
        gameSettings = { ...defaults, ...savedSettings };
        applySettings();
    }
    function saveSettings() { localStorage.setItem('neonOutbreakSettings', JSON.stringify(gameSettings)); }
    function applySettings() {
        targetInterval = 1000 / gameSettings.fps;
        document.documentElement.style.setProperty('--ui-opacity', gameSettings.uiOpacity / 100);
    }
    function updateSettingsUI() {
        document.querySelectorAll('#fpsSelector button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.fps) === gameSettings.fps));
        effectsToggle.checked = gameSettings.effectsOn;
        uiOpacitySlider.value = gameSettings.uiOpacity; uiOpacityValue.textContent = `${gameSettings.uiOpacity}%`;
        aimOpacitySlider.value = gameSettings.aimOpacity; aimOpacityValue.textContent = `${gameSettings.aimOpacity}%`;
    }

    function setupTouchControls() {
        if (!isTouchDevice) return;
        touchLeftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.a.pressed = true; }, { passive: false });
        touchLeftBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys.a.pressed = false; });
        touchRightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.d.pressed = true; }, { passive: false });
        touchRightBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys.d.pressed = false; });
        touchJumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (player) player.jump(); }, { passive: false });
    
        let joystickActive = false; let joystickStartX = 0; let joystickStartY = 0;
        aimJoystick.addEventListener('touchstart', (e) => {
            e.preventDefault(); joystickActive = true; aimStick.active = true;
            const rect = aimJoystick.getBoundingClientRect(); joystickStartX = rect.left + rect.width / 2; joystickStartY = rect.top + rect.height / 2;
        }, { passive: false });
        aimJoystick.addEventListener('touchmove', (e) => {
            e.preventDefault(); if (!joystickActive || !e.touches[0]) return;
            const touch = e.touches[0]; const dx = touch.clientX - joystickStartX; const dy = touch.clientY - joystickStartY;
            aimStick.angle = Math.atan2(dy, dx);
            const maxMove = aimJoystick.offsetWidth / 2 - aimJoystickKnob.offsetWidth / 2;
            const distance = Math.min(maxMove, Math.hypot(dx, dy));
            const moveX = Math.cos(aimStick.angle) * distance; const moveY = Math.sin(aimStick.angle) * distance;
            aimJoystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
        }, { passive: false });
        const resetJoystick = (e) => { e.preventDefault(); joystickActive = false; aimStick.active = false; aimJoystickKnob.style.transform = 'translate(0px, 0px)'; };
        aimJoystick.addEventListener('touchend', resetJoystick);
        aimJoystick.addEventListener('touchcancel', resetJoystick);
    }

    // --- EVENT LISTENERS ---
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', (e) => { if (!isGameRunning || isPaused) return; switch (e.code) { case 'KeyA': case 'ArrowLeft': keys.a.pressed = true; break; case 'KeyD': case 'ArrowRight': keys.d.pressed = true; break; case 'Space': case 'KeyW': case 'ArrowUp': if(player) player.jump(); break; } });
    window.addEventListener('keyup', (e) => { if (!isGameRunning) return; switch (e.code) { case 'KeyA': case 'ArrowLeft': keys.a.pressed = false; break; case 'KeyD': case 'ArrowRight': keys.d.pressed = false; break; } });
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / scaleX; mouse.y = (e.clientY - r.top) / scaleY; });
    canvas.addEventListener('mousedown', () => { if (isGameRunning && !isPaused) mouse.down = true; });
    window.addEventListener('mouseup', () => { mouse.down = false; });
    
    setupTouchControls(); 
    
    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => startGame(isMultiplayer));
    backToMenuBtn.addEventListener('click', returnToMenu);
    quitBtn.addEventListener('click', returnToMenu);
    pauseBtn.addEventListener('click', () => { if (isMultiplayer) return; isPaused = !isPaused; pauseBtn.textContent = isPaused ? '▶' : '❚❚'; });
    rerollUpgradesBtn.addEventListener('click', () => { if (player && player.rerolls > 0) { player.rerolls--; showUpgradeModal(); } });
    totalReactionBtn.addEventListener('click', () => { if (player && player.totalReactionReady) { reactionBlade = { active: true, x: 0, y: player.y, width: player.width, height: 15, hitEnemies: [] }; if (isMultiplayer) socket.emit('playerUsedTotalReaction'); else { player.totalReactionReady = false; player.currentReactionCooldown = player.totalReactionCooldown + 1; } updateUI(); } });
    
    showRankingBtn.addEventListener('click', async () => {
        try {
            rankingTableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>'; rankingModal.style.display = 'flex';
            const response = await fetch('/api/ranking');
            if (!response.ok) throw new Error(`Falha ao carregar o ranking (status: ${response.status})`);
            const scores = await response.json();
            rankingTableBody.innerHTML = '';
            if (scores.length === 0) { rankingTableBody.innerHTML = `<tr><td colspan="4">Nenhuma pontuação registrada ainda.</td></tr>`; } 
            else {
                // ATUALIZADO: Exibe a horda em vez da data
                scores.forEach((score, index) => {
                    const row = rankingTableBody.insertRow();
                    row.innerHTML = `<td>${index + 1}</td><td>${score.name || 'Anônimo'}</td><td>${score.timeSurvived}</td><td>${score.waveReached}</td>`;
                });
            }
        } catch (error) { console.error('Erro ao buscar ranking:', error); rankingTableBody.innerHTML = `<tr><td colspan="4">Não foi possível carregar o ranking.</td></tr>`; }
    });
    closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');

    settingsBtn.addEventListener('click', () => { updateSettingsUI(); settingsModal.style.display = 'flex'; });
    saveSettingsBtn.addEventListener('click', () => { saveSettings(); applySettings(); settingsModal.style.display = 'none'; });
    fpsSelector.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') { gameSettings.fps = parseInt(e.target.dataset.fps); updateSettingsUI(); } });
    effectsToggle.addEventListener('change', (e) => { gameSettings.effectsOn = e.target.checked; });
    uiOpacitySlider.addEventListener('input', (e) => { gameSettings.uiOpacity = parseInt(e.target.value); uiOpacityValue.textContent = `${e.target.value}%`; document.documentElement.style.setProperty('--ui-opacity', e.target.value / 100); });
    aimOpacitySlider.addEventListener('input', (e) => { gameSettings.aimOpacity = parseInt(e.target.value); aimOpacityValue.textContent = `${e.target.value}%`; });

    // --- Inicialização ---
    loadSettings();
    initBackground();
    animateBackground();
});
