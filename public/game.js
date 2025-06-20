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
    let player, otherPlayers = {}, enemies = [], projectiles = [], enemyProjectiles = [], particles = [];
    let logicalWidth = 900, logicalHeight = 1600; 
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };
    const aimStick = { active: false, angle: 0 };
    let aimAngle = 0;

    // --- ESTADO DAS HORDAS (para single-player) ---
    let spState = {
        wave: 0, waveState: 'intermission', waveTimer: 5 * 60, enemiesToSpawn: 0, spawnCooldown: 0
    };

    // --- CONFIGURAÇÕES DO JOGO ---
    const gravity = 0.6;
    const NEON_GREEN = '#00ff7f';
    const FLOOR_HEIGHT = 60; // Altura do novo chão de tijolos

    // --- Posições no Canvas ---
    const DEFENSE_LINE_Y_RATIO = 0.5;
    const BOSS_LINE_Y_RATIO = 0.3;
    const SNIPER_LINE_Y_VAL = 80;

    // --- CONFIGS DE HORDAS (espelhado do servidor) ---
    const WAVE_CONFIG = [
        { color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3000 },
        { color: '#FF851B', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 2800 },
        { color: '#FFDC00', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 2500 },
        { color: '#7FDBFF', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2200 },
        { color: '#B10DC9', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2000 }
    ];
    const SNIPER_BASE_CONFIG = {
        color: '#00FFFF', hpMultiplier: 0.8, damageMultiplier: 0.5,
        projectileDamageMultiplier: 1.15, shootCooldownMultiplier: 1.30,
        width: 25, height: 50, isSniper: true,
        speed: 1.0, horizontalSpeed: 0.5
    };
    const BOSS_CONFIG = {
        color: '#FFFFFF', hp: 4000, speed: 1.2, horizontalSpeed: 0.8, damage: 50,
        projectileDamage: 35, shootCooldown: 1200, width: 120, height: 120, isBoss: true
    };
    const WAVE_INTERVAL_TICKS = 15 * 60;
    const ENEMIES_PER_WAVE = [10, 15];

    // --- Funções de escalonamento para SP ---
    function getSPWaveConfig(wave) {
        const baseConfig = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1];
        const scalingFactor = 1 + (Math.max(0, wave - WAVE_CONFIG.length) * 0.1);
        return { ...baseConfig, hp: Math.floor(baseConfig.hp * scalingFactor), damage: Math.floor(baseConfig.damage * scalingFactor), projectileDamage: Math.floor(baseConfig.projectileDamage * scalingFactor) };
    }
    function getSPBossConfig(wave) {
        const scalingFactor = 1 + (Math.max(0, wave - 4) * 0.15);
        return { ...BOSS_CONFIG, hp: Math.floor(BOSS_CONFIG.hp * scalingFactor), damage: Math.floor(BOSS_CONFIG.damage * scalingFactor), projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scalingFactor) };
    }


    // --- CLASSES DO JOGO ---
    class Ally {
        constructor(owner) {
            this.owner = owner;
            this.width = owner.width / 4;
            this.height = owner.height / 4;
            this.x = 0;
            this.y = 0;
            this.maxHp = owner.maxHp / 2;
            this.hp = this.maxHp;
            this.lastShootTime = 0;
            this.isInvincible = false;
        }

        draw() {
            ctx.fillStyle = this.isInvincible ? 'rgba(0, 255, 127, 0.4)' : NEON_GREEN;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        update(enemyList) {
            // Posiciona no ombro do jogador
            this.x = this.owner.x - this.width - 5;
            this.y = this.owner.y - this.height;

            // Encontra o inimigo mais próximo
            let nearestEnemy = null;
            let minDistance = Infinity;
            enemyList.forEach(enemy => {
                const distance = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestEnemy = enemy;
                }
            });

            if (nearestEnemy) {
                this.shoot(nearestEnemy);
            }
            this.draw();
        }

        shoot(target) {
            const now = Date.now();
            if (now - this.lastShootTime > this.owner.shootCooldown * 1.5) { // Atira um pouco mais devagar que o jogador
                this.lastShootTime = now;
                const angle = Math.atan2((target.y + target.height / 2) - (this.y + this.height / 2), (target.x + target.width / 2) - (this.x + this.width / 2));
                const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.owner.bulletSpeed, this.owner.bulletDamage / 2, NEON_GREEN, 'player');
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
                this.owner.allyCooldownWave = spState.wave + 2;
                if(isMultiplayer) socket.emit('playerLostAlly');
            }
        }
    }

    class Player {
        constructor(x, y, color = 'white', name = "Player") {
            this.name = name; this.x = x; this.y = y;
            this.width = 40; this.height = 60;
            this.color = color; this.velocityY = 0;
            this.speed = 5; this.jumpForce = 15; this.onGround = false;
            this.maxHp = 100; this.hp = this.maxHp;
            this.isInvincible = false;
            this.exp = 0; this.level = 1; this.expToNextLevel = 100;
            this.shootCooldown = 250; this.lastShootTime = 0;
            this.bulletDamage = 10; this.bulletSpeed = 10;
            // Upgrades
            this.cadenceUpgrades = 0;
            this.ally = null;
            this.allyCooldownWave = 0;
        }

        draw() {
            ctx.fillStyle = this.isInvincible ? 'rgba(255, 255, 255, 0.5)' : this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = 'white'; ctx.font = '20px VT323';
            ctx.textAlign = 'center'; ctx.fillText(this.name, this.x + this.width / 2, this.y - 10);
            if (this.ally) this.ally.draw();
        }

        update() {
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
            setTimeout(() => this.isInvincible = false, 500);
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
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
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
                else if (this.isBoss) targetY = canvas.height * BOSS_LINE_Y_RATIO;
                else targetY = canvas.height * DEFENSE_LINE_Y_RATIO;

                if (!this.reachedPosition) {
                    if (this.y < targetY) {
                        this.y += this.speed;
                    } else {
                        this.y = targetY;
                        this.reachedPosition = true;
                        this.patrolOriginX = this.x;
                        this.patrolRange = canvas.width * 0.1;
                    }
                } else {
                    const moveDirection = Math.sign(player.x - this.x);
                    const patrolSpeed = this.horizontalSpeed || this.speed / 2;
                    this.x += moveDirection * patrolSpeed;

                    // Manter dentro da área de patrulha
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
            if (owner !== 'player') this.radius = 8;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        update() { this.draw(); this.x += this.velocity.x; this.y += this.velocity.y; }
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
        player = new Player(canvas.width / 2, canvas.height - 100, 'white', playerName);
        projectiles = []; enemies = []; enemyProjectiles = []; otherPlayers = {};
        spState = { wave: 0, waveState: 'intermission', waveTimer: 5 * 60, enemiesToSpawn: 0, spawnCooldown: 0 };
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
                if (id === socket.id) { // Sync local player's ally status from server
                    if(state.players[id].hasAlly && !player.ally) player.ally = new Ally(player);
                    if(!state.players[id].hasAlly && player.ally) player.ally = null;
                    continue;
                }
                const pData = state.players[id];
                if(!otherPlayers[id]) {
                    otherPlayers[id] = new Player(pData.x * scaleX, pData.y * scaleY, '#999999', pData.name);
                }
                otherPlayers[id].x = pData.x * scaleX; otherPlayers[id].y = pData.y * scaleY;
                otherPlayers[id].hp = pData.hp; otherPlayers[id].name = pData.name;
                // Sync other players' allies
                if (pData.hasAlly && !otherPlayers[id].ally) {
                    otherPlayers[id].ally = new Ally(otherPlayers[id]);
                } else if (!pData.hasAlly && otherPlayers[id].ally) {
                    otherPlayers[id].ally = null;
                }
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
        if (aimStick.active) {
            isAiming = true;
            aimAngle = aimStick.angle;
        } else if (mouse.down) {
            isAiming = true;
            aimAngle = Math.atan2(mouse.y - (player.y + player.height / 2), mouse.x - (player.x + player.width / 2));
        }

        if (isAiming) player.shoot(aimAngle);
    }
    
    function drawFloor() {
        const brickWidth = 40;
        const brickHeight = 20;
        const startY = canvas.height - FLOOR_HEIGHT;

        for (let y = startY; y < canvas.height; y += brickHeight) {
            for (let x = (y / brickHeight) % 2 === 0 ? 0 : -brickWidth / 2; x < canvas.width; x += brickWidth) {
                ctx.fillStyle = '#2a2a2a'; // Cor do tijolo
                ctx.fillRect(x, y, brickWidth, brickHeight);
                ctx.strokeStyle = '#000'; // Cor da argamassa
                ctx.strokeRect(x, y, brickWidth, brickHeight);
            }
        }
    }

    function drawBackground() {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawFloor();
        // A linha verde foi removida daqui.
    }

    function updateSinglePlayerLogic() {
        if (spState.waveState === 'intermission') {
            spState.waveTimer--;
            if (spState.waveTimer <= 0) {
                spState.wave++; spState.waveState = 'active';
                const waveConfig = getSPWaveConfig(spState.wave);

                spState.enemiesToSpawn = Math.floor(Math.random() * (ENEMIES_PER_WAVE[1] - ENEMIES_PER_WAVE[0] + 1)) + ENEMIES_PER_WAVE[0] + spState.wave;
                spState.spawnCooldown = 0;

                if (spState.wave >= 2) {
                    const sniperCount = Math.min(8, (spState.wave - 1) * 2);
                    for (let i = 0; i < sniperCount; i++) {
                        const sniperConfig = {
                            ...SNIPER_BASE_CONFIG, id: `sniper_${Date.now()}_${Math.random()}`,
                            x: Math.random() * (canvas.width - SNIPER_BASE_CONFIG.width), y: -50,
                            hp: waveConfig.hp * SNIPER_BASE_CONFIG.hpMultiplier, damage: waveConfig.damage * SNIPER_BASE_CONFIG.damageMultiplier,
                            projectileDamage: waveConfig.projectileDamage * SNIPER_BASE_CONFIG.projectileDamageMultiplier, shootCooldown: waveConfig.shootCooldown * SNIPER_BASE_CONFIG.shootCooldownMultiplier
                        };
                        enemies.push(new Enemy(sniperConfig));
                    }
                }

                if (spState.wave >= 5) {
                    const bossCount = spState.wave - 4;
                    for (let i = 0; i < bossCount; i++) {
                        const bossConfig = {
                            ...getSPBossConfig(spState.wave), id: `boss_${Date.now()}_${Math.random()}`,
                            x: (canvas.width / (bossCount + 1)) * (i + 1) - BOSS_CONFIG.width / 2, y: -BOSS_CONFIG.height,
                        };
                        enemies.push(new Enemy(bossConfig));
                    }
                }
            }
        } else if (spState.waveState === 'active' && enemies.length === 0 && spState.enemiesToSpawn === 0) {
            spState.waveState = 'intermission';
            spState.waveTimer = WAVE_INTERVAL_TICKS;
        }

        if (spState.waveState === 'active' && spState.enemiesToSpawn > 0) {
            spState.spawnCooldown--;
            if (spState.spawnCooldown <= 0) {
                const config = getSPWaveConfig(spState.wave);
                const enemyConfig = { ...config, id: `enemy_${Date.now()}_${Math.random()}`, x: Math.random() * (canvas.width - 40), y: -50, width: 40, height: 40, horizontalSpeed: config.speed / 2 };
                enemies.push(new Enemy(enemyConfig));
                spState.enemiesToSpawn--;
                spState.spawnCooldown = 180 / (1 + spState.wave * 0.05);
            }
        }

        enemies.forEach(enemy => {
            const now = Date.now();
            if (enemy.reachedPosition && now > (enemy.lastShotTime || 0) + enemy.shootCooldown) {
                enemy.lastShotTime = now;
                const angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (player.x + player.width / 2) - (enemy.x + enemy.width / 2));
                const bulletColor = enemy.color;
                enemyProjectiles.push(new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, 5, enemy.projectileDamage, bulletColor, 'enemy'));
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
        
        if (!isMultiplayer) {
            updateSinglePlayerLogic();
        } else if (socket) {
            socket.emit('playerUpdate', { x: player.x / (canvas.width / logicalWidth), y: player.y / (canvas.height / logicalHeight), hp: player.hp, name: player.name });
        }

        player.update();
        handleAimingAndShooting();
        Object.values(otherPlayers).forEach(p => p.draw());
        
        projectiles.forEach((p, i) => {
            p.update();
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1);
        });
        enemyProjectiles.forEach((p, i) => {
            p.update();
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) enemyProjectiles.splice(i, 1);
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
                    enemyProjectiles.splice(j, 1);
                    break; 
                }
            }
        }

        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            if (checkCollision(player, p)) {
                player.takeDamage(p.damage);
                enemyProjectiles.splice(i, 1);
            } else if (player.ally && checkCollision(player.ally, p)) {
                player.ally.takeDamage(p.damage);
                enemyProjectiles.splice(i, 1);
            }
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
                            const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : 50);
                            setTimeout(() => {
                                const currentIndex = enemies.findIndex(e => e.id === enemy.id);
                                if (currentIndex !== -1) {
                                    enemies.splice(currentIndex, 1); 
                                    player.addExp(expGain);
                                }
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

        return (obj1Left < obj2Right && obj1Right > obj2Left &&
                obj1Top < obj2Bottom && obj1Bottom > obj2Top);
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
        const allUpgrades = [
            { name: "Cadência Rápida", desc: "+10% velocidade de tiro", apply: p => { p.shootCooldown *= 0.90; p.cadenceUpgrades++; }, available: p => p.cadenceUpgrades < 4 },
            { name: "Bala Potente", desc: "+20% dano", apply: p => p.bulletDamage = Math.ceil(p.bulletDamage * 1.2), available: () => true },
            { name: "Pele de Aço", desc: "+25 HP máximo", apply: p => { p.maxHp += 25; p.hp += 25; }, available: () => true },
            { name: "Velocista", desc: "+10% velocidade de mov.", apply: p => p.speed *= 1.1, available: () => true },
            { name: "Kit Médico", desc: "Cura 50% da vida máxima", apply: p => p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5), available: () => true },
            { name: "Chame um Amigo", desc: "Cria um ajudante que atira automaticamente.", apply: p => { p.ally = new Ally(p); if(isMultiplayer) socket.emit('playerGotAlly'); }, available: p => spState.wave >= 4 && !p.ally && spState.wave >= p.allyCooldownWave }
        ];

        const availableOptions = allUpgrades.filter(upg => upg.available(player));
        const options = [...availableOptions].sort(() => 0.5 - Math.random()).slice(0, 3);

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
    
    window.addEventListener('keydown', (e) => {
        if (!isGameRunning || isPaused) return;
        switch (e.code) {
            case 'KeyA': case 'ArrowLeft': keys.a.pressed = true; break;
            case 'KeyD': case 'ArrowRight': keys.d.pressed = true; break;
            case 'Space': case 'KeyW': case 'ArrowUp': if(player) player.jump(); break;
        }
    });
    window.addEventListener('keyup', (e) => {
        if (!isGameRunning) return;
        switch (e.code) {
            case 'KeyA': case 'ArrowLeft': keys.a.pressed = false; break;
            case 'KeyD': case 'ArrowRight': keys.d.pressed = false; break;
        }
    });

    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    canvas.addEventListener('mousedown', () => { if (isGameRunning && !isPaused) mouse.down = true; });
    window.addEventListener('mouseup', () => { mouse.down = false; });

    function setupTouchControls() {
        function handleJoystick(e, stick, knob, state) {
            e.preventDefault();
            const rect = stick.getBoundingClientRect();
            const touch = e.touches[0];
            let x = touch.clientX - rect.left - rect.width / 2;
            let y = touch.clientY - rect.top - rect.height / 2;
            const distance = Math.min(rect.width / 4, Math.hypot(x, y));
            const angle = Math.atan2(y, x);
            state.active = true; state.angle = angle;
            knob.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
        }
        function resetJoystick(knob, state) {
            state.active = false; knob.style.transform = `translate(0px, 0px)`;
        }

        aimJoystick.addEventListener('touchstart', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchmove', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchend', () => resetJoystick(aimJoystickKnob, aimStick));
        
        const addTouchListener = (btn, key) => {
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key].pressed = true; }, { passive: false });
            btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key].pressed = false; });
        };
        addTouchListener(touchLeftBtn, 'a');
        addTouchListener(touchRightBtn, 'd');
    }
    setupTouchControls();

    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => startGame(isMultiplayer));
    backToMenuBtn.addEventListener('click', returnToMenu);
    quitBtn.addEventListener('click', returnToMenu);
    pauseBtn.addEventListener('click', () => {
        if (isMultiplayer) return; isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶' : '❚❚';
    });
    
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
