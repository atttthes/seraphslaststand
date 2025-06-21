// game.js
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const mainMenu = document.getElementById('mainMenu');
    const gameContainer = document.getElementById('gameContainer');
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
    const gameOverModal = document.getElementById('gameOverModal');
    const finalTimeDisplay = document.getElementById('finalTime');
    const finalWaveDisplay = document.getElementById('finalWave');
    const restartBtn = document.getElementById('restartBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const upgradeModal = document.getElementById('upgradeModal');
    const upgradeOptionsContainer = document.getElementById('upgradeOptions');
    const rankingModal = document.getElementById('rankingModal');
    const rankingTableBody = document.querySelector('#rankingTable tbody');
    const closeRankingBtn = document.getElementById('closeRankingBtn');

    // Controles Touch
    const touchLeftBtn = document.getElementById('touchLeft');
    const touchRightBtn = document.getElementById('touchRight');
    const aimJoystick = document.getElementById('aimJoystick');
    const aimJoystickKnob = document.getElementById('aimJoystickKnob');

    // --- ESTADO DO JOGO ---
    let isGameRunning = false, isPaused = false, isGameOver = false, isMultiplayer = false;
    let gameTime = 0, animationFrameId, socket, playerName = "Jogador";
    let player, otherPlayers = {}, enemies = [], projectiles = [], enemyProjectiles = [], particles = [], lightningStrikes = [];
    let logicalWidth = 900, logicalHeight = 1600; 
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };
    const aimStick = { active: false, angle: 0 };
    let aimAngle = 0;

    // --- ESTADO DAS HORDAS (para single-player) ---
    let spState = {
        wave: 0, waveState: 'intermission', waveTimer: 5 * 60
    };

    // --- CONFIGURAÇÕES DO JOGO ---
    const gravity = 0.6;
    const NEON_GREEN = '#00ff7f';
    const FLOOR_HEIGHT = 60;

    // --- Posições no Canvas ---
    const DEFENSE_LINE_Y_RATIO = 0.5;
    const BOSS_LINE_Y_RATIO = 0.3;
    const RICOCHET_LINE_Y_RATIO = 0.1125;
    const SNIPER_LINE_Y_VAL = 80;

    // --- CONFIGS DE HORDAS ---
    const WAVE_CONFIG = [
        { color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3600 },
        { color: '#FF4136', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 3360 },
        { color: '#FF4136', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 3000 },
        { color: '#FF4136', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2640 },
        { color: '#FF4136', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2400 }
    ];
    const SNIPER_BASE_CONFIG = {
        color: '#00FFFF', hpMultiplier: 0.8, damageMultiplier: 0.5,
        projectileDamageMultiplier: 1.15, shootCooldownMultiplier: 1.30 * 1.2,
        width: 25, height: 50, isSniper: true,
        speed: 1.0, horizontalSpeed: 0.5
    };
    const RICOCHET_CONFIG = { 
        color: '#FF69B4', hp: 250, speed: 1.2, horizontalSpeed: 0.6, projectileDamage: 20, 
        shootCooldown: 4200, isRicochet: true, width: 35, height: 35 
    };
    const BOSS_CONFIG = {
        color: '#FFFFFF', hp: 500, speed: 1.2, horizontalSpeed: 0.8, damage: 50,
        projectileDamage: 35, shootCooldown: 1440, width: 120, height: 120, isBoss: true
    };
    const WAVE_INTERVAL_TICKS = 10 * 60;

    // --- Funções de escalonamento para SP ---
    function getSPScalingFactor(wave) {
        if (wave <= 1) return 1.0;
        return 1.0 + Math.min(0.5, (wave - 1) * 0.1);
    }
    
    function getSPWaveConfig(wave) {
        const baseConfig = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1];
        const scalingFactor = getSPScalingFactor(wave);
        return { 
            ...baseConfig, 
            hp: Math.floor(baseConfig.hp * scalingFactor), 
            damage: Math.floor(baseConfig.damage * scalingFactor), 
            projectileDamage: Math.floor(baseConfig.projectileDamage * scalingFactor) 
        };
    }
    
    function getSPRicochetConfig(wave) {
        const scalingFactor = getSPScalingFactor(wave);
        return { 
            ...RICOCHET_CONFIG, 
            hp: Math.floor(RICOCHET_CONFIG.hp * scalingFactor), 
            projectileDamage: Math.floor(RICOCHET_CONFIG.projectileDamage * scalingFactor) 
        };
    }
    
    function getSPBossConfig(wave) {
        const scalingFactor = getSPScalingFactor(wave);
        return { 
            ...BOSS_CONFIG, 
            hp: Math.floor(BOSS_CONFIG.hp * scalingFactor), 
            damage: Math.floor(BOSS_CONFIG.damage * scalingFactor), 
            projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scalingFactor) 
        };
    }

    // --- FUNÇÃO DE DESENHO DO PERSONAGEM ---
    function drawTrashCan(x, y, width, height, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3;

        const bodyHeight = height * 0.85;
        const lidHeight = height * 0.15;
        const lidWidth = width * 1.1;
        const handleHeight = height * 0.1;
        const handleWidth = width * 0.4;

        // Corpo da lata
        ctx.beginPath();
        ctx.moveTo(x, y + lidHeight);
        ctx.lineTo(x + width, y + lidHeight);
        ctx.lineTo(x + width * 0.9, y + height);
        ctx.lineTo(x + width * 0.1, y + height);
        ctx.closePath();
        ctx.stroke();

        // Tampa
        ctx.strokeRect(x - (lidWidth - width) / 2, y, lidWidth, lidHeight);

        // Alça da tampa
        ctx.strokeRect(x + (width - handleWidth) / 2, y - handleHeight, handleWidth, handleHeight);
        
        ctx.restore();
    }
    
    // --- CLASSES DO JOGO ---
    class Ally {
        constructor(owner) {
            this.owner = owner;
            this.width = owner.width / 1.5; // Um pouco menor que o player
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
                const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.owner.bulletSpeed, this.owner.bulletDamage / 2, '#FFFFFF', 'player');
                projectiles.push(bullet);
                if(isMultiplayer) socket.emit('playerShoot', { x: bullet.x / (canvas.width / logicalWidth), y: bullet.y / (canvas.height / logicalHeight), angle: bullet.angle, speed: bullet.speed, damage: bullet.damage });
            }
        }

        takeDamage(damage) {
            if (this.isInvincible) return;
            this.hp -= damage;
            this.isInvincible = true;
            setTimeout(() => this.isInvincible = false, 500);
            if (this.hp <= 0) {
                this.owner.ally = null;
                this.owner.allyCooldownWave = (isMultiplayer ? spState.wave : spState.wave) + 2;
                if(isMultiplayer) socket.emit('playerLostAlly');
            }
        }
    }

    class Player {
        constructor(x, y, name = "Player") {
            this.name = name; this.x = x; this.y = y;
            this.width = 40; this.height = 60;
            this.velocityY = 0; this.speed = 5; this.jumpForce = 15; this.onGround = false;
            this.maxHp = 100; this.hp = this.maxHp;
            this.isInvincible = false; this.invincibleTime = 500;
            this.exp = 0; this.level = 1; this.expToNextLevel = 100;
            this.shootCooldown = 250; this.lastShootTime = 0;
            this.bulletDamage = 60; this.bulletSpeed = 10;
            this.cadenceUpgrades = 0; this.ally = null; this.allyCooldownWave = 0;
            this.hasLightning = false; this.nextLightningTime = 0;
            
            // Escudo Mágico (REWORK)
            this.shield = {
                active: false,
                hp: 0,
                maxHp: 3000,
                radius: 70,
                auraFlicker: 0
            };
        }

        drawShield() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;

            this.shield.auraFlicker += 0.05;
            const auraSize = 15 + Math.sin(this.shield.auraFlicker) * 5;
            const shieldOpacity = 0.3 + 0.4 * (this.shield.hp / this.shield.maxHp);
            
            ctx.shadowColor = NEON_GREEN;
            ctx.shadowBlur = auraSize;

            ctx.beginPath();
            ctx.arc(centerX, centerY, this.shield.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 127, ${shieldOpacity})`;
            ctx.fill();
            
            ctx.shadowBlur = 0;
        }

        draw() {
            if (this.shield.active) this.drawShield();
            
            const color = this.isInvincible ? 'rgba(0, 255, 127, 0.5)' : NEON_GREEN;
            drawTrashCan(this.x, this.y, this.width, this.height, color);

            ctx.fillStyle = 'white'; ctx.font = '20px VT323';
            ctx.textAlign = 'center'; ctx.fillText(this.name, this.x + this.width / 2, this.y - 15); // Ajustado para a alça
            if (this.ally) this.ally.draw();
        }

        update() {
            if (this.shield.active && this.shield.hp <= 0) {
                this.shield.active = false;
            }
            
            this.draw(); 
            if (this.ally) this.ally.update(enemies);

            this.y += this.velocityY;
            if (keys.a.pressed) this.x -= this.speed;
            if (keys.d.pressed) this.x += this.speed;
            
            if (this.x < 0) this.x = 0;
            if (this.x > canvas.width - this.width) this.x = canvas.width - this.width;

            const groundY = canvas.height - this.height - FLOOR_HEIGHT;
            if (this.y + this.velocityY >= groundY) {
                this.velocityY = 0; this.onGround = true; this.y = groundY;
            } else {
                this.velocityY += gravity; this.onGround = false;
            }
        }
        
        jump() { if (this.onGround) { this.velocityY = -this.jumpForce; this.onGround = false; } }

        shoot(angle) {
            const now = Date.now();
            if (now - this.lastShootTime > this.shootCooldown) {
                this.lastShootTime = now;
                const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.bulletSpeed, this.bulletDamage, NEON_GREEN, 'player');
                projectiles.push(bullet);
                if(isMultiplayer) socket.emit('playerShoot', { x: bullet.x / (canvas.width / logicalWidth), y: bullet.y / (canvas.height / logicalHeight), angle: bullet.angle, speed: bullet.speed, damage: bullet.damage });
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

        addExp(amount) {
            this.exp += amount;
            if (this.exp >= this.expToNextLevel) this.levelUp();
            updateUI();
        }
        
        levelUp() {
            this.exp -= this.expToNextLevel; this.level++;
            this.expToNextLevel = Math.floor(this.expToNextLevel * 1.5);
            this.hp = this.maxHp;
            showUpgradeModal();
        }
    }

    class Enemy {
        constructor(config) {
            Object.assign(this, config);
            this.maxHp = config.hp;
            this.patrolOriginX = null;
            this.patrolRange = 0;
            this.reachedPosition = false;
        }

        draw() {
            ctx.save();
            ctx.strokeStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.restore();

            const hpRatio = this.hp / this.maxHp;
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x, this.y - 10, this.width, 5);
            ctx.fillStyle = hpRatio > 0.5 ? 'lightgreen' : hpRatio > 0.2 ? 'gold' : 'red';
            ctx.fillRect(this.x, this.y - 10, this.width * hpRatio, 5);
        }

        update() {
            if (!isMultiplayer) {
                let targetY;
                if (this.isSniper) targetY = SNIPER_LINE_Y_VAL;
                else if (this.isRicochet) targetY = canvas.height * RICOCHET_LINE_Y_RATIO;
                else if (this.isBoss) targetY = canvas.height * BOSS_LINE_Y_RATIO;
                else targetY = canvas.height * DEFENSE_LINE_Y_RATIO;

                if (!this.reachedPosition) {
                    if (this.y < targetY) { this.y += this.speed; } 
                    else { this.y = targetY; this.reachedPosition = true; this.patrolOriginX = this.x; this.patrolRange = canvas.width * (this.isBoss ? 0.3 : 0.1); }
                } else {
                    const patrolSpeed = this.horizontalSpeed || this.speed / 2;
                    if (!this.isRicochet) {
                        const moveDirection = Math.sign(player.x - this.x);
                        this.x += moveDirection * patrolSpeed;
                    }
                    const leftBoundary = this.patrolOriginX - (this.patrolRange / 2);
                    const rightBoundary = this.patrolOriginX + (this.patrolRange / 2);
                    if (this.x < leftBoundary) this.x = leftBoundary;
                    if (this.x > rightBoundary - this.width) this.x = rightBoundary - this.width;
                }
                
                if (this.x < 0) this.x = 0;
                if (this.x > canvas.width - this.width) this.x = canvas.width - this.width;
            }
            this.draw();
        }
    }
    
    class Projectile {
        constructor(x, y, angle, speed, damage, color, owner = 'player') {
            this.id = `proj_${Date.now()}_${Math.random()}`;
            this.x = x; this.y = y; this.radius = 5;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage; this.owner = owner; this.color = color;
            this.trail = []; this.trailLength = 15;
            if (owner !== 'player') this.radius = 8;
        }

        drawTrail() {
            for (let i = 0; i < this.trail.length; i++) {
                const pos = this.trail[i];
                ctx.globalAlpha = (i / this.trail.length) * 0.5;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        draw() {
            this.drawTrail();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        update() { 
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailLength) {
                this.trail.shift();
            }
            this.x += this.velocity.x; 
            this.y += this.velocity.y; 
            this.draw();
        }
    }
    
    // --- FUNÇÕES DO JOGO ---
    function cleanup() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (socket) socket.disconnect();
        animationFrameId = null; socket = null;
        isGameRunning = false; isPaused = false;
    }

    function returnToMenu() {
        cleanup();
        gameOverModal.style.display = 'none';
        gameContainer.style.display = 'none';
        mainMenu.style.display = 'flex';
    }

    function init() {
        cleanup(); isGameOver = false; gameTime = 0;
        resizeCanvas();
        player = new Player(canvas.width / 2, canvas.height - 100, playerName);
        projectiles = []; enemies = []; enemyProjectiles = []; lightningStrikes = []; otherPlayers = {};
        spState = { wave: 0, waveState: 'intermission', waveTimer: WAVE_INTERVAL_TICKS };
        updateUI(); gameOverModal.style.display = 'none';
        
        if (isMultiplayer) {
            connectMultiplayer(); pauseBtn.style.display = 'none';
        } else {
            pauseBtn.style.display = 'block'; pauseBtn.textContent = '❚❚';
        }
    }
    
    function resizeCanvas() {
        const gameRect = gameContainer.getBoundingClientRect();
        canvas.width = gameRect.width;
        canvas.height = gameRect.height;
    }

    function startGame(multiplayer) {
        playerName = playerNameInput.value || "Anônimo";
        isMultiplayer = multiplayer;
        mainMenu.style.display = 'none';
        gameContainer.style.display = 'block';
        init(); isGameRunning = true; animate();
    }

    function connectMultiplayer() {
        socket = io();
        socket.on('connect', () => {
            console.log("Conectado! ID:", socket.id);
            socket.emit('joinMultiplayer', { name: player.name, x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp });
        });
        socket.on('roomJoined', (data) => {
            logicalWidth = data.logicalWidth;
            logicalHeight = data.logicalHeight;
        });
        socket.on('gameState', (state) => {
            if (!isGameRunning) return;
            gameTime = state.gameTime;
            spState.wave = state.wave;
            spState.waveState = state.waveState; 
            spState.waveTimer = state.waveTimer * 60;

            const scaleX = canvas.width / logicalWidth;
            const scaleY = canvas.height / logicalHeight;

            const serverEnemyIds = state.enemies.map(e => e.id);
            enemies = enemies.filter(e => serverEnemyIds.includes(e.id));
            state.enemies.forEach(eData => {
                let enemy = enemies.find(e => e.id === eData.id);
                const enemyConfig = { ...eData, x: eData.x * scaleX, y: eData.y * scaleY, width: eData.width * scaleX, height: eData.height * scaleY};
                if (enemy) { Object.assign(enemy, enemyConfig); } 
                else { enemies.push(new Enemy(enemyConfig)); }
            });

            lightningStrikes = state.lightningStrikes;

            const serverProjectileIds = new Set(state.enemyProjectiles.map(p => p.id));
            enemyProjectiles = enemyProjectiles.filter(ep => serverProjectileIds.has(ep.id));
            state.enemyProjectiles.forEach(pData => {
                let p = enemyProjectiles.find(ep => ep.id === pData.id);
                if (!p) {
                   const newProj = new Projectile(pData.x * scaleX, pData.y * scaleY, 0, 0, pData.damage, pData.color, 'enemy');
                   newProj.id = pData.id;
                   newProj.velocity.x = pData.vx * scaleX;
                   newProj.velocity.y = pData.vy * scaleY;
                   enemyProjectiles.push(newProj);
                }
            });

            for(const id in state.players) {
                if (id === socket.id) {
                    if(state.players[id].hasAlly && !player.ally) player.ally = new Ally(player);
                    if(!state.players[id].hasAlly && player.ally) player.ally = null;
                    if(state.players[id].hasLightning) player.hasLightning = true;
                    continue;
                }
                const pData = state.players[id];
                if(!otherPlayers[id]) {
                    otherPlayers[id] = new Player(pData.x * scaleX, pData.y * scaleY, pData.name);
                }
                otherPlayers[id].x = pData.x * scaleX; otherPlayers[id].y = pData.y * scaleY;
                otherPlayers[id].hp = pData.hp; otherPlayers[id].name = pData.name;
                if (pData.hasAlly && !otherPlayers[id].ally) { otherPlayers[id].ally = new Ally(otherPlayers[id]); } 
                else if (!pData.hasAlly && otherPlayers[id].ally) { otherPlayers[id].ally = null; }
                if (pData.hasLightning) otherPlayers[id].hasLightning = true;
            }
        });

        socket.on('playerHit', (damage) => player.takeDamage(damage));
        socket.on('playerShot', (bulletData) => {
            const scaleX = canvas.width / logicalWidth;
            const scaleY = canvas.height / logicalHeight;
            projectiles.push(new Projectile(bulletData.x * scaleX, bulletData.y * scaleY, bulletData.angle, bulletData.speed, bulletData.damage, NEON_GREEN, 'other_player'))
        });
        socket.on('enemyDied', ({ enemyId, killerId, expGain }) => {
            enemies = enemies.filter(e => e.id !== enemyId);
            if(killerId === socket.id) player.addExp(expGain);
        });
        socket.on('playerLeft', (id) => delete otherPlayers[id]);
    }

    function handleAimingAndShooting() {
        let isAiming = false;
        if (aimStick.active) { isAiming = true; aimAngle = aimStick.angle; } 
        else if (mouse.down) { isAiming = true; aimAngle = Math.atan2(mouse.y - (player.y + player.height / 2), mouse.x - (player.x + player.width / 2)); }
        if (isAiming) player.shoot(aimAngle);
    }
    
    function drawFloor() {
        const brickWidth = 40; const brickHeight = 20;
        const startY = canvas.height - FLOOR_HEIGHT;
        for (let y = startY; y < canvas.height; y += brickHeight) {
            for (let x = (y / brickHeight) % 2 === 0 ? 0 : -brickWidth / 2; x < canvas.width; x += brickWidth) {
                ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y, brickWidth, brickHeight);
                ctx.strokeStyle = '#000'; ctx.strokeRect(x, y, brickWidth, brickHeight);
            }
        }
    }

    function drawLightning(x, width) {
        ctx.save();
        ctx.shadowColor = '#8A2BE2'; ctx.shadowBlur = 25;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + Math.random() * 0.5})`;
        ctx.lineWidth = 1 + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(x + (Math.random() - 0.5) * width, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * width, canvas.height * 0.4);
        ctx.lineTo(x + (Math.random() - 0.5) * width, canvas.height * 0.8);
        ctx.lineTo(x + (Math.random() - 0.5) * width, canvas.height);
        ctx.stroke();
        ctx.restore();
    }
    
    function drawBackground() {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawFloor();
    }

    function updateSPLightning() {
        const visualDurationTicks = 30; // 0.5s
        lightningStrikes = lightningStrikes.filter(s => gameTime < s.creationTime + visualDurationTicks);
    
        if (player.hasLightning && gameTime >= player.nextLightningTime) {
            player.nextLightningTime = gameTime + 9 * 60; // Próximo raio em 9 segundos
            const lightningDamage = WAVE_CONFIG[0].hp;
    
            for (let i = 0; i < 3; i++) {
                const strikeX = Math.random() * canvas.width;
                const strikeWidth = player.width * 1.2;
                lightningStrikes.push({ x: strikeX, width: strikeWidth, creationTime: gameTime });
                enemies.forEach(enemy => {
                   if (enemy.x + enemy.width > strikeX - strikeWidth / 2 && enemy.x < strikeX + strikeWidth / 2) {
                        enemy.hp -= lightningDamage;
                   }
                });
            }
            
            enemies = enemies.filter(e => {
                if (e.hp <= 0) {
                    const expGain = e.isBoss ? 1000 : (e.isSniper ? 75 : (e.isRicochet ? 60 : 50));
                    player.addExp(expGain);
                    return false;
                }
                return true;
            });
        }
    }
    
    function updateSinglePlayerLogic() {
        updateSPLightning();

        if (spState.waveState === 'intermission') {
            spState.waveTimer--;
            if (spState.waveTimer <= 0) {
                spState.wave++; spState.waveState = 'active';
                const waveConfig = getSPWaveConfig(spState.wave);

                const normalEnemyCount = spState.wave + 1;
                for(let i = 0; i < normalEnemyCount; i++) {
                    const enemyConfig = { ...waveConfig, id: `enemy_${Date.now()}_${i}`, x: Math.random() * (canvas.width - 40), y: -50, width: 40, height: 40, horizontalSpeed: waveConfig.speed / 2 };
                    setTimeout(() => enemies.push(new Enemy(enemyConfig)), i * 250);
                }

                if (spState.wave >= 3) {
                    const sniperCount = 1 + (spState.wave - 3) * 2;
                    for (let i = 0; i < sniperCount; i++) {
                        const sniperConfig = {
                            ...SNIPER_BASE_CONFIG, id: `sniper_${Date.now()}_${i}`, x: Math.random() * (canvas.width - SNIPER_BASE_CONFIG.width), y: -50,
                            hp: waveConfig.hp * SNIPER_BASE_CONFIG.hpMultiplier, damage: waveConfig.damage * SNIPER_BASE_CONFIG.damageMultiplier,
                            projectileDamage: waveConfig.projectileDamage * SNIPER_BASE_CONFIG.projectileDamageMultiplier, shootCooldown: waveConfig.shootCooldown * SNIPER_BASE_CONFIG.shootCooldownMultiplier
                        };
                        enemies.push(new Enemy(sniperConfig));
                    }
                }
                
                if (spState.wave >= 7 && (spState.wave - 7) % 2 === 0) {
                    const ricochetCount = Math.floor((spState.wave - 7) / 2) + 1;
                    const ricochetConfigBase = getSPRicochetConfig(spState.wave);
                    for (let i = 0; i < ricochetCount; i++) {
                        const ricochetConfig = { ...ricochetConfigBase, id: `ricochet_${Date.now()}_${i}`, x: Math.random() * (canvas.width - ricochetConfigBase.width), y: -50 };
                        enemies.push(new Enemy(ricochetConfig));
                    }
                }

                if (spState.wave >= 10 && (spState.wave - 10) % 3 === 0) {
                    const bossCount = Math.floor((spState.wave - 10) / 3) + 1;
                    const bossConfigBase = getSPBossConfig(spState.wave);
                    for (let i = 0; i < bossCount; i++) {
                        const bossConfig = { ...bossConfigBase, id: `boss_${Date.now()}_${i}`, x: (canvas.width / (bossCount + 1)) * (i + 1) - BOSS_CONFIG.width / 2, y: -BOSS_CONFIG.height };
                        enemies.push(new Enemy(bossConfig));
                    }
                }
            }
        } else if (spState.waveState === 'active' && enemies.length === 0) {
            spState.waveState = 'intermission';
            spState.waveTimer = WAVE_INTERVAL_TICKS;
        }

        enemies.forEach(enemy => {
            const now = Date.now();
            if (enemy.reachedPosition && now > (enemy.lastShotTime || 0) + enemy.shootCooldown) {
                enemy.lastShotTime = now;
                if (enemy.isRicochet) {
                    const wallX = (player.x > enemy.x) ? canvas.width : 0;
                    const virtualPlayerX = (wallX === 0) ? -player.x : (2 * canvas.width - player.x);
                    const angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (virtualPlayerX + player.width / 2) - (enemy.x + enemy.width / 2));
                    const proj = new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, 8, enemy.projectileDamage, enemy.color, 'enemy');
                    proj.canRicochet = true; proj.bouncesLeft = 1;
                    enemyProjectiles.push(proj);
                } else {
                    const angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (player.x + player.width / 2) - (enemy.x + enemy.width / 2));
                    enemyProjectiles.push(new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, 5, enemy.projectileDamage, enemy.color, 'enemy'));
                }
            }
        });
    }

    function animate() {
        if (isGameOver) { cleanup(); return; }
        animationFrameId = requestAnimationFrame(animate);
        if (isPaused) return;

        gameTime++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        
        const isAiming = (aimStick.active || mouse.down);
        if (!isPaused && isAiming && player) {
            let currentAimAngle = aimStick.active ? aimStick.angle : Math.atan2(mouse.y - (player.y + player.height / 2), mouse.x - (player.x + player.width / 2));
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(player.x + player.width / 2, player.y + player.height / 2);
            ctx.lineTo(player.x + player.width / 2 + Math.cos(currentAimAngle) * 2000, player.y + player.height / 2 + Math.sin(currentAimAngle) * 2000);
            ctx.strokeStyle = 'rgba(0, 255, 127, 0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }

        if (!isMultiplayer) updateSinglePlayerLogic();
        else if (socket) socket.emit('playerUpdate', { x: player.x / (canvas.width / logicalWidth), y: player.y / (canvas.height / logicalHeight), hp: player.hp, name: player.name });

        player.update();
        handleAimingAndShooting();
        Object.values(otherPlayers).forEach(p => p.draw());
        
        const scaleX = canvas.width / logicalWidth;
        lightningStrikes.forEach(strike => {
            const strikeXPos = isMultiplayer ? strike.x * scaleX : strike.x;
            const strikeWidth = isMultiplayer ? strike.width * scaleX : strike.width;
            for(let i=0; i<3; i++) drawLightning(strikeXPos, strikeWidth);
        });

        projectiles.forEach((p, i) => {
            p.update();
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1);
        });
        
        enemyProjectiles.forEach((p, i) => {
            if (!isMultiplayer && p.canRicochet && p.bouncesLeft > 0) {
                if (p.x <= p.radius || p.x >= canvas.width - p.radius) {
                    p.velocity.x *= -1; p.bouncesLeft--;
                    p.x = p.x <= p.radius ? p.radius + 1 : canvas.width - p.radius - 1;
                }
            }
            if(!isMultiplayer) p.update(); else p.draw();
            if (p.x < -50 || p.x > canvas.width+50 || p.y < -50 || p.y > canvas.height+50) {
                if (!isMultiplayer) enemyProjectiles.splice(i, 1);
            }
        });

        // --- LÓGICA DE COLISÃO ---
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            if (p.owner !== 'player') continue;
            for (let j = enemyProjectiles.length - 1; j >= 0; j--) {
                const ep = enemyProjectiles[j];
                if (checkCollision(p, ep)) {
                    if (isMultiplayer && socket) socket.emit('enemyProjectileDestroyed', ep.id);
                    projectiles.splice(i, 1);
                    if (!isMultiplayer) enemyProjectiles.splice(j, 1);
                    break; 
                }
            }
        }

        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            
            if (player.shield.active) {
                const dx = p.x - (player.x + player.width / 2);
                const dy = p.y - (player.y + player.height / 2);
                if (Math.hypot(dx, dy) < player.shield.radius + p.radius) {
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
                if(proj.owner === 'player' && checkCollision(proj, enemy)) {
                    if (isMultiplayer) {
                        socket.emit('enemyHit', { enemyId: enemy.id, damage: proj.damage });
                    } else {
                        enemy.hp -= proj.damage;
                        if(enemy.hp <= 0) {
                            const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                            setTimeout(() => {
                                const currentIndex = enemies.findIndex(e => e.id === enemy.id);
                                if (currentIndex !== -1) { enemies.splice(currentIndex, 1); player.addExp(expGain); }
                            }, 0);
                        }
                    }
                    projectiles.splice(projIndex, 1);
                }
            }
        });
        
        updateUI();
    }

    function checkCollision(obj1, obj2) {
        const r1 = obj1.radius || 0; const r2 = obj2.radius || 0;
        const w1 = obj1.width || 0; const h1 = obj1.height || 0;
        const w2 = obj2.width || 0; const h2 = obj2.height || 0;
        
        const obj1Left = obj1.x - r1; const obj1Right = obj1.x + (w1 || r1);
        const obj1Top = obj1.y - r1; const obj1Bottom = obj1.y + (h1 || r1);
        const obj2Left = obj2.x - r2; const obj2Right = obj2.x + (w2 || r2);
        const obj2Top = obj2.y - r2; const obj2Bottom = obj2.y + (h2 || r2);

        return (obj1Left < obj2Right && obj1Right > obj2Left && obj1Top < obj2Bottom && obj1Bottom > obj2Top);
    }

    function updateUI() {
        if (!player) return;
        hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
        expBar.style.width = `${(player.exp / player.expToNextLevel) * 100}%`;
        timerDisplay.textContent = `Tempo: ${Math.floor(gameTime/60)}s`;
        
        if (spState.waveState === 'intermission') {
            const timer = isMultiplayer ? Math.ceil(spState.waveTimer/60) : Math.ceil(spState.waveTimer / 60);
            waveDisplay.textContent = `Próxima horda em ${timer}s`;
            waveDisplay.style.color = "gold";
        } else {
            waveDisplay.textContent = `Horda: ${spState.wave}`;
            waveDisplay.style.color = "white";
        }
    }
    
    async function endGame() {
        if (isGameOver) return;
        isGameOver = true; isGameRunning = false;
        finalTimeDisplay.textContent = Math.floor(gameTime/60);
        finalWaveDisplay.textContent = `${spState.wave}`;
        gameOverModal.style.display = 'flex';
        try {
            await fetch('/api/ranking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName, timeSurvived: Math.floor(gameTime/60) })
            });
        } catch (error) { console.error("Falha ao salvar pontuação:", error); }
    }

    function showUpgradeModal() {
        isPaused = true; upgradeOptionsContainer.innerHTML = '';
        const currentWave = isMultiplayer ? spState.wave : spState.wave;
        const allUpgrades = [
            { name: "Cadência Rápida", desc: "+10% velocidade de tiro", apply: p => { p.shootCooldown *= 0.90; p.cadenceUpgrades++; }, available: p => p.cadenceUpgrades < 4 },
            { name: "Bala Potente", desc: "+20% dano", apply: p => p.bulletDamage = Math.ceil(p.bulletDamage * 1.2), available: () => true },
            { name: "Pele de Aço", desc: "+25 HP máximo", apply: p => { p.maxHp += 25; p.hp += 25; }, available: () => true },
            { name: "Velocista", desc: "+10% velocidade de mov.", apply: p => p.speed *= 1.1, available: () => true },
            { name: "Kit Médico", desc: "Cura 50% da vida máxima", apply: p => p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5), available: () => true },
            { name: "Chame um Amigo", desc: "Cria um ajudante (lata de lixo) que atira automaticamente.", apply: p => { p.ally = new Ally(p); if(isMultiplayer) socket.emit('playerGotAlly'); }, available: p => currentWave >= 4 && !p.ally && currentWave >= p.allyCooldownWave },
            { 
                name: "Fúria dos Céus (Raio)", 
                desc: "A cada 9s, 3 raios caem do céu, causando dano massivo. Efeito permanente.", 
                apply: p => { p.hasLightning = true; if(isMultiplayer) socket.emit('playerGotLightning'); }, 
                available: p => currentWave >= 8 && !p.hasLightning
            },
            { 
                name: "Escudo Mágico", 
                desc: "Cria um escudo com 3000 de vida que bloqueia projéteis. Renovar restaura a vida.", 
                apply: p => { p.shield.active = true; p.shield.hp = p.shield.maxHp; }, 
                available: p => currentWave >= 5
            }
        ];

        const availableOptions = allUpgrades.filter(upg => upg.available(player));
        const options = [...availableOptions].sort(() => 0.5 - Math.random()).slice(0, 4);

        options.forEach(upgrade => {
            const card = document.createElement('div'); card.className = 'upgrade-card';
            card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`;
            card.onclick = () => selectUpgrade(upgrade);
            upgradeOptionsContainer.appendChild(card);
        });
        upgradeModal.style.display = 'flex';
    }

    function selectUpgrade(upgrade) {
        upgrade.apply(player); upgradeModal.style.display = 'none'; isPaused = false;
    }

    // --- EVENT LISTENERS ---
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', (e) => { if (!isGameRunning || isPaused) return; switch (e.code) { case 'KeyA': case 'ArrowLeft': keys.a.pressed = true; break; case 'KeyD': case 'ArrowRight': keys.d.pressed = true; break; case 'Space': case 'KeyW': case 'ArrowUp': if(player) player.jump(); break; } });
    window.addEventListener('keyup', (e) => { if (!isGameRunning) return; switch (e.code) { case 'KeyA': case 'ArrowLeft': keys.a.pressed = false; break; case 'KeyD': case 'ArrowRight': keys.d.pressed = false; break; } });
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    canvas.addEventListener('mousedown', () => { if (isGameRunning && !isPaused) mouse.down = true; });
    window.addEventListener('mouseup', () => { mouse.down = false; });

    function setupTouchControls() {
        function handleJoystick(e, stick, knob, state) {
            e.preventDefault(); const rect = stick.getBoundingClientRect(); const touch = e.touches[0];
            let x = touch.clientX - rect.left - rect.width / 2; let y = touch.clientY - rect.top - rect.height / 2;
            const distance = Math.min(rect.width / 4, Math.hypot(x, y)); const angle = Math.atan2(y, x);
            state.active = true; state.angle = angle;
            knob.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
        }
        function resetJoystick(knob, state) { state.active = false; knob.style.transform = `translate(0px, 0px)`; }
        aimJoystick.addEventListener('touchstart', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchmove', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchend', () => resetJoystick(aimJoystickKnob, aimStick));
        const addTouchListener = (btn, key) => { btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key].pressed = true; }, { passive: false }); btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key].pressed = false; }); };
        addTouchListener(touchLeftBtn, 'a'); addTouchListener(touchRightBtn, 'd');
    }
    setupTouchControls();

    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => startGame(isMultiplayer));
    backToMenuBtn.addEventListener('click', returnToMenu);
    quitBtn.addEventListener('click', returnToMenu);
    pauseBtn.addEventListener('click', () => { if (isMultiplayer) return; isPaused = !isPaused; pauseBtn.textContent = isPaused ? '▶' : '❚❚'; });
    
    showRankingBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/ranking'); const scores = await res.json();
            rankingTableBody.innerHTML = '';
            scores.forEach((score, index) => {
                const row = document.createElement('tr');
                const date = new Date(score.date).toLocaleDateString('pt-BR');
                row.innerHTML = `<td>${index + 1}</td><td>${score.name}</td><td>${score.timeSurvived}</td><td>${date}</td>`;
                rankingTableBody.appendChild(row);
            });
            rankingModal.style.display = 'flex';
        } catch (error) { alert("Não foi possível carregar o ranking."); console.error(error); }
    });
    closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');
});
