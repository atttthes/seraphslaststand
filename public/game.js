// game.js
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const mainMenu = document.getElementById('mainMenu');
    const gameContainer = document.getElementById('gameContainer');
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const backgroundCanvas = document.getElementById('backgroundCanvas');
    const bgCtx = backgroundCanvas.getContext('2d');
    
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
    const rerollUpgradesBtn = document.getElementById('rerollUpgradesBtn');
    const rankingModal = document.getElementById('rankingModal');
    const rankingTableBody = document.querySelector('#rankingTable tbody');
    const closeRankingBtn = document.getElementById('closeRankingBtn');

    // Controles Touch
    const totalReactionBtn = document.getElementById('totalReactionBtn');
    const touchLeftBtn = document.getElementById('touchLeft');
    const touchRightBtn = document.getElementById('touchRight');
    const aimJoystick = document.getElementById('aimJoystick');
    const aimJoystickKnob = document.getElementById('aimJoystickKnob');

    // --- ESTADO DO JOGO ---
    let isGameRunning = false, isPaused = false, isGameOver = false, isMultiplayer = false;
    let gameTime = 0, animationFrameId, socket, playerName = "Jogador";
    let player, otherPlayers = {}, enemies = [], projectiles = [], enemyProjectiles = [], particles = [], lightningStrikes = [], activeBlades = [];
    let logicalWidth = 900, logicalHeight = 1600; 
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };
    const aimStick = { active: false, angle: 0 };
    let aimAngle = 0;

    // --- ESTADO DAS HORDAS (para single-player) ---
    let spState = {
        wave: 0, waveState: 'intermission', waveTimer: 5 * 60,
        lastShotTimeByClass: {} // Para IA de tiro SP
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
        { class: 'normal', color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3600 },
        { class: 'normal', color: '#FF4136', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 3360 },
        { class: 'normal', color: '#FF4136', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 3000 },
        { class: 'normal', color: '#FF4136', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2640 },
        { class: 'normal', color: '#FF4136', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2400 }
    ];
    const SNIPER_BASE_CONFIG = {
        class: 'sniper', color: '#00FFFF', hpMultiplier: 0.8, damageMultiplier: 0.5,
        projectileDamageMultiplier: 1.15, shootCooldownMultiplier: 1.30 * 1.2,
        width: 25, height: 50, isSniper: true,
        speed: 1.0, horizontalSpeed: 0.5
    };
    const RICOCHET_CONFIG = { 
        class: 'ricochet', color: '#FF69B4', hp: 250, speed: 1.2, horizontalSpeed: 0.6, projectileDamage: 20, 
        shootCooldown: 4200, isRicochet: true, width: 35, height: 35 
    };
    const BOSS_CONFIG = {
        class: 'boss', color: '#FFFFFF', hp: 500, speed: 1.2, horizontalSpeed: 0.8, damage: 50,
        projectileDamage: 35, shootCooldown: 1440, width: 120, height: 120, isBoss: true
    };
    const WAVE_INTERVAL_TICKS = 10 * 60;
    
    // --- LÓGICA DO BACKGROUND ANIMADO ---
    let orbs = [];
    let hue = 0;

    class Orb {
        constructor(x, y, radius, vx, vy, color) {
            this.x = x; this.y = y;
            this.radius = radius;
            this.vx = vx; this.vy = vy;
            this.color = color;
        }
        draw(context) {
            context.beginPath();
            context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            context.fillStyle = this.color;
            context.fill();
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x - this.radius < 0 || this.x + this.radius > bgCtx.canvas.width) this.vx *= -1;
            if (this.y - this.radius < 0 || this.y + this.radius > bgCtx.canvas.height) this.vy *= -1;
        }
    }

    function initBackground() {
        bgCtx.canvas.width = window.innerWidth;
        bgCtx.canvas.height = window.innerHeight;
        orbs = [];
        for (let i = 0; i < 30; i++) {
            orbs.push(new Orb(
                Math.random() * bgCtx.canvas.width,
                Math.random() * bgCtx.canvas.height,
                Math.random() * 20 + 5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                `hsla(${Math.random() * 360}, 100%, 70%, 0.5)`
            ));
        }
    }

    function animateBackground() {
        hue = (hue + 0.5) % 360;
        bgCtx.globalAlpha = 0.1;
        bgCtx.fillStyle = '#000';
        bgCtx.fillRect(0, 0, bgCtx.canvas.width, bgCtx.canvas.height);
        bgCtx.globalAlpha = 1;

        orbs.forEach((orb, i) => {
            orb.color = `hsla(${(hue + i * 10) % 360}, 100%, 70%, 0.5)`;
            orb.update();
            orb.draw(bgCtx);
        });
        requestAnimationFrame(animateBackground);
    }
    
    // --- Funções de escalonamento para SP ---
    function getSPScalingFactor(wave) {
        if (wave <= 1) return 1.0;
        return 1.0 + Math.min(0.5, (wave - 1) * 0.1);
    }
    function getSPWaveConfig(wave) {
        const baseConfig = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1];
        const scalingFactor = getSPScalingFactor(wave);
        return { ...baseConfig, hp: Math.floor(baseConfig.hp * scalingFactor), damage: Math.floor(baseConfig.damage * scalingFactor), projectileDamage: Math.floor(baseConfig.projectileDamage * scalingFactor) };
    }
    function getSPRicochetConfig(wave) {
        const scalingFactor = getSPScalingFactor(wave);
        return { ...RICOCHET_CONFIG, hp: Math.floor(RICOCHET_CONFIG.hp * scalingFactor), projectileDamage: Math.floor(RICOCHET_CONFIG.projectileDamage * scalingFactor) };
    }
    function getSPBossConfig(wave) {
        const scalingFactor = getSPScalingFactor(wave);
        return { ...BOSS_CONFIG, hp: Math.floor(BOSS_CONFIG.hp * scalingFactor), damage: Math.floor(BOSS_CONFIG.damage * scalingFactor), projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scalingFactor) };
    }

    // --- FUNÇÃO DE DESENHO DO PERSONAGEM ---
    function drawTrashCan(x, y, width, height, color) {
        ctx.save(); ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 15; ctx.lineWidth = 3;
        const bodyHeight = height * 0.85, lidHeight = height * 0.15, lidWidth = width * 1.1, handleHeight = height * 0.1, handleWidth = width * 0.4;
        ctx.beginPath(); ctx.moveTo(x, y + lidHeight); ctx.lineTo(x + width, y + lidHeight); ctx.lineTo(x + width * 0.9, y + height); ctx.lineTo(x + width * 0.1, y + height); ctx.closePath(); ctx.stroke();
        ctx.strokeRect(x - (lidWidth - width) / 2, y, lidWidth, lidHeight);
        ctx.strokeRect(x + (width - handleWidth) / 2, y - handleHeight, handleWidth, handleHeight);
        ctx.restore();
    }
    
    // --- CLASSES DO JOGO ---
    class TotalReactionBlade {
        constructor(owner) {
            this.owner = owner;
            this.y = owner.y + owner.height;
            this.height = 15;
            this.width = owner.width;
            this.maxWidth = canvas.width * 1.5;
            this.speed = 12;
            this.life = 120; // Duração em frames
        }

        update() {
            this.y -= this.speed;
            const progress = (this.owner.y - this.y) / this.owner.y;
            this.width = Math.min(this.maxWidth, this.owner.width + progress * this.maxWidth);
            this.life--;
        }

        draw() {
            ctx.save();
            const x = this.owner.x + this.owner.width / 2 - this.width / 2;
            const grd = ctx.createLinearGradient(x, this.y, x + this.width, this.y);
            grd.addColorStop(0, "rgba(255, 255, 255, 0)");
            grd.addColorStop(0.5, "rgba(255, 255, 255, 1)");
            grd.addColorStop(1, "rgba(255, 255, 255, 0)");
            
            ctx.fillStyle = grd;
            ctx.shadowColor = 'white';
            ctx.shadowBlur = 20;

            ctx.beginPath();
            ctx.moveTo(x, this.y);
            ctx.quadraticCurveTo(x + this.width / 2, this.y - this.height * 2, x + this.width, this.y);
            ctx.quadraticCurveTo(x + this.width / 2, this.y - this.height, x, this.y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    class Ally { /* ... (código inalterado) ... */ }

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
            this.shield = { active: false, hp: 0, maxHp: 3000, radius: 70, auraFlicker: 0 };

            // Reação Total
            this.hasTotalReaction = false;
            this.totalReactionReady = false;
            this.totalReactionCooldownEndWave = 0;
        }

        drawShield() { /* ... (código inalterado) ... */ }
        draw() { /* ... (código inalterado, exceto por chamada de this.ally.draw()) ... */ }
        update() { /* ... (código inalterado) ... */ }
        jump() { /* ... (código inalterado) ... */ }
        shoot(angle) { /* ... (código inalterado) ... */ }
        takeDamage(damage) { /* ... (código inalterado) ... */ }
        addExp(amount) { /* ... (código inalterado) ... */ }
        levelUp() { /* ... (código inalterado) ... */ }
    }

    class Enemy { /* ... (código inalterado) ... */ }
    
    class Projectile {
        constructor(x, y, angle, speed, damage, color, owner = 'player', shooterId = null) {
            this.id = `proj_${Date.now()}_${Math.random()}`;
            this.x = x; this.y = y; this.radius = 5;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage; this.owner = owner; this.color = color;
            this.shooterId = shooterId; // ID do inimigo que atirou
            this.trail = []; this.trailLength = 15;
            if (owner !== 'player') this.radius = 8;
        }

        drawTrail() { /* ... (código inalterado) ... */ }
        draw() { /* ... (código inalterado) ... */ }
        update() { /* ... (código inalterado) ... */ }
    }
    
    // --- FUNÇÕES DO JOGO ---
    function cleanup() { /* ... (código inalterado) ... */ }
    function returnToMenu() { /* ... (código inalterado) ... */ }

    function init() {
        cleanup(); isGameOver = false; gameTime = 0;
        resizeCanvas();
        player = new Player(canvas.width / 2, canvas.height - 100, playerName);
        projectiles = []; enemies = []; enemyProjectiles = []; lightningStrikes = []; otherPlayers = {}; activeBlades = [];
        spState = { wave: 0, waveState: 'intermission', waveTimer: WAVE_INTERVAL_TICKS, lastShotTimeByClass: {} };
        updateUI(); gameOverModal.style.display = 'none';
        
        if (player.hasTotalReaction) totalReactionBtn.style.display = 'flex';
        else totalReactionBtn.style.display = 'none';
        
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
        bgCtx.canvas.width = window.innerWidth;
        bgCtx.canvas.height = window.innerHeight;
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
                   const newProj = new Projectile(pData.x * scaleX, pData.y * scaleY, 0, 0, pData.damage, pData.color, 'enemy', pData.shooterId);
                   newProj.id = pData.id;
                   newProj.velocity.x = pData.vx * scaleX;
                   newProj.velocity.y = pData.vy * scaleY;
                   enemyProjectiles.push(newProj);
                }
            });
            
            // Reação Total - Verifica se algum jogador usou
            activeBlades = [];
            state.activeBlades.forEach(bladeData => {
                const owner = bladeData.ownerId === socket.id ? player : otherPlayers[bladeData.ownerId];
                if (owner) {
                    const blade = new TotalReactionBlade(owner);
                    // Sincroniza o estado da lâmina com o servidor
                    blade.y = bladeData.y * scaleY;
                    blade.width = bladeData.width * scaleX;
                    activeBlades.push(blade);
                }
            });

            for(const id in state.players) {
                const pData = state.players[id];
                if (id === socket.id) {
                    if (pData.hasTotalReaction) {
                        player.hasTotalReaction = true;
                        player.totalReactionReady = pData.totalReactionReady;
                        totalReactionBtn.style.display = 'flex';
                    }
                    if(pData.hasAlly && !player.ally) player.ally = new Ally(player);
                    if(!pData.hasAlly && player.ally) player.ally = null;
                    if(pData.hasLightning) player.hasLightning = true;
                    continue;
                }
                if(!otherPlayers[id]) otherPlayers[id] = new Player(pData.x * scaleX, pData.y * scaleY, pData.name);
                otherPlayers[id].x = pData.x * scaleX; otherPlayers[id].y = pData.y * scaleY;
                otherPlayers[id].hp = pData.hp; otherPlayers[id].name = pData.name;
                if (pData.hasAlly && !otherPlayers[id].ally) { otherPlayers[id].ally = new Ally(otherPlayers[id]); } 
                else if (!pData.hasAlly && otherPlayers[id].ally) { otherPlayers[id].ally = null; }
                if (pData.hasLightning) otherPlayers[id].hasLightning = true;
            }
        });

        socket.on('playerHit', (damage) => player.takeDamage(damage));
        socket.on('playerShot', (bulletData) => { /* ... (código inalterado) ... */ });
        socket.on('enemyDied', ({ enemyId, killerId, expGain }) => { /* ... (código inalterado) ... */ });
        socket.on('playerLeft', (id) => delete otherPlayers[id]);
    }

    function handleAimingAndShooting() { /* ... (código inalterado) ... */ }
    function drawFloor() { /* ... (código inalterado) ... */ }
    function drawLightning(x, width) { /* ... (código inalterado) ... */ }
    
    function drawBackground() {
        // A animação de fundo agora é feita em seu próprio loop,
        // então o canvas do jogo só precisa ser limpo.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawFloor(); // Desenha o chão por cima do fundo de orbs
    }

    function updateSPLightning() { /* ... (código inalterado) ... */ }
    
    function updateSinglePlayerLogic() {
        updateSPLightning();

        // Checar recarga da Reação Total
        if (player.hasTotalReaction && !player.totalReactionReady && spState.wave >= player.totalReactionCooldownEndWave) {
            player.totalReactionReady = true;
        }

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

                if (spState.wave >= 3) { /* ... (código inalterado) ... */ }
                if (spState.wave >= 7 && (spState.wave - 7) % 2 === 0) { /* ... (código inalterado) ... */ }
                if (spState.wave >= 10 && (spState.wave - 10) % 3 === 0) { /* ... (código inalterado) ... */ }
            }
        } else if (spState.waveState === 'active' && enemies.length === 0) {
            spState.waveState = 'intermission';
            spState.waveTimer = WAVE_INTERVAL_TICKS;
        }

        enemies.forEach(enemy => {
            const now = Date.now();
            // Lógica de tiro com delay de classe
            const enemyClass = enemy.class || 'normal';
            const canShoot = now > (enemy.lastShotTime || 0) + enemy.shootCooldown;
            const classCooldown = now > (spState.lastShotTimeByClass[enemyClass] || 0) + 300; // 0.3s

            if (enemy.reachedPosition && canShoot && classCooldown) {
                spState.lastShotTimeByClass[enemyClass] = now;
                enemy.lastShotTime = now;
                if (enemy.isRicochet) {
                    const wallX = (player.x > enemy.x) ? canvas.width : 0;
                    const virtualPlayerX = (wallX === 0) ? -player.x : (2 * canvas.width - player.x);
                    const angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (virtualPlayerX + player.width / 2) - (enemy.x + enemy.width / 2));
                    const proj = new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, 8, enemy.projectileDamage, enemy.color, 'enemy', enemy.id);
                    proj.canRicochet = true; proj.bouncesLeft = 1;
                    enemyProjectiles.push(proj);
                } else {
                    const angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (player.x + player.width / 2) - (enemy.x + enemy.width / 2));
                    enemyProjectiles.push(new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, 5, enemy.projectileDamage, enemy.color, 'enemy', enemy.id));
                }
            }
        });
    }

    function animate() {
        if (isGameOver) { cleanup(); return; }
        animationFrameId = requestAnimationFrame(animate);
        if (isPaused) return;

        gameTime++;
        drawBackground();
        
        const isAiming = (aimStick.active || mouse.down);
        if (!isPaused && isAiming && player) { /* ... (código de mira inalterado) ... */ }

        if (!isMultiplayer) updateSinglePlayerLogic();
        else if (socket) socket.emit('playerUpdate', { x: player.x / (canvas.width / logicalWidth), y: player.y / (canvas.height / logicalHeight), hp: player.hp, name: player.name });

        player.update();
        handleAimingAndShooting();
        Object.values(otherPlayers).forEach(p => p.draw());
        
        // Lâminas (Reação Total)
        for (let i = activeBlades.length - 1; i >= 0; i--) {
            const blade = activeBlades[i];
            if (!isMultiplayer) blade.update();
            blade.draw();
            if (!isMultiplayer && blade.life <= 0) activeBlades.splice(i, 1);
        }

        const scaleX = canvas.width / logicalWidth;
        lightningStrikes.forEach(strike => { /* ... (código inalterado) ... */ });

        projectiles.forEach((p, i) => { /* ... (código inalterado) ... */ });
        
        enemyProjectiles.forEach((p, i) => { /* ... (código inalterado) ... */ });

        // --- LÓGICA DE COLISÃO ---
        // Colisão da lâmina com projéteis (Single-Player)
        if (!isMultiplayer) {
            for (let bladeIndex = activeBlades.length - 1; bladeIndex >= 0; bladeIndex--) {
                const blade = activeBlades[bladeIndex];
                for (let projIndex = enemyProjectiles.length - 1; projIndex >= 0; projIndex--) {
                    const proj = enemyProjectiles[projIndex];
                    if (proj.x > blade.owner.x - blade.width / 2 && proj.x < blade.owner.x + blade.width / 2 && proj.y > blade.y && proj.y < blade.y + blade.height) {
                        const originalShooter = enemies.find(e => e.id === proj.shooterId);
                        if (originalShooter) {
                            const angle = Math.atan2((originalShooter.y + originalShooter.height / 2) - (proj.y), (originalShooter.x + originalShooter.width / 2) - (proj.x));
                            const reflectedProj = new Projectile(proj.x, proj.y, angle, 12, proj.damage * 3, '#FFFFFF', 'player');
                            projectiles.push(reflectedProj);
                        }
                        enemyProjectiles.splice(projIndex, 1);
                    }
                }
            }
        }
        
        for (let i = projectiles.length - 1; i >= 0; i--) { /* ... (código de colisão projétil vs projétil inalterado) ... */ }
        for (let i = enemyProjectiles.length - 1; i >= 0; i--) { /* ... (código de colisão projétil vs jogador inalterado) ... */ }
        enemies.forEach((enemy) => { /* ... (código de colisão jogador/projétil vs inimigo inalterado) ... */ });
        
        updateUI();
    }

    function checkCollision(obj1, obj2) { /* ... (código inalterado) ... */ }

    function updateUI() {
        if (!player) return;
        hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
        expBar.style.width = `${(player.exp / player.expToNextLevel) * 100}%`;
        timerDisplay.textContent = `Tempo: ${Math.floor(gameTime/60)}s`;
        
        if (spState.waveState === 'intermission') {
            const timer = isMultiplayer ? Math.ceil(spState.waveTimer/60) : Math.ceil(spState.waveTimer / 60);
            waveDisplay.innerHTML = `Horda: ${spState.wave}<br>Próxima em ${timer}s`;
            waveDisplay.style.color = "gold";
        } else {
            waveDisplay.innerHTML = `Horda: ${spState.wave}`;
            waveDisplay.style.color = "white";
        }

        if (player.hasTotalReaction) {
            totalReactionBtn.disabled = !player.totalReactionReady;
        }
    }
    
    async function endGame() { /* ... (código inalterado) ... */ }

    let upgradeRerollsLeft = 1;
    function showUpgradeModal() {
        isPaused = true; 
        upgradeRerollsLeft = 1;
        rerollUpgradesBtn.disabled = false;
        rerollUpgradesBtn.textContent = `Rerolar Opções (${upgradeRerollsLeft})`;
        generateUpgradeOptions();
        upgradeModal.style.display = 'flex';
    }

    function generateUpgradeOptions() {
        upgradeOptionsContainer.innerHTML = '';
        const currentWave = isMultiplayer ? spState.wave : spState.wave;
        const allUpgrades = [
            { name: "Cadência Rápida", desc: "+10% velocidade de tiro", apply: p => { p.shootCooldown *= 0.90; p.cadenceUpgrades++; }, available: p => p.cadenceUpgrades < 4 },
            { name: "Bala Potente", desc: "+20% dano", apply: p => p.bulletDamage = Math.ceil(p.bulletDamage * 1.2), available: () => true },
            { name: "Pele de Aço", desc: "+25 HP máximo", apply: p => { p.maxHp += 25; p.hp += 25; }, available: () => true },
            { name: "Velocista", desc: "+10% velocidade de mov.", apply: p => p.speed *= 1.1, available: () => true },
            { name: "Kit Médico", desc: "Cura 50% da vida máxima", apply: p => p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5), available: () => true },
            { name: "Chame um Amigo", desc: "Cria um ajudante (lata de lixo) que atira automaticamente.", apply: p => { p.ally = new Ally(p); if(isMultiplayer) socket.emit('playerGotAlly'); }, available: p => currentWave >= 4 && !p.ally && currentWave >= p.allyCooldownWave },
            { name: "Fúria dos Céus (Raio)", desc: "A cada 9s, 3 raios caem do céu, causando dano massivo. Efeito permanente.", apply: p => { p.hasLightning = true; if(isMultiplayer) socket.emit('playerGotLightning'); }, available: p => currentWave >= 8 && !p.hasLightning },
            { name: "Escudo Mágico", desc: "Cria um escudo com 3000 de vida que bloqueia projéteis. Renovar restaura a vida.", apply: p => { p.shield.active = true; p.shield.hp = p.shield.maxHp; }, available: p => currentWave >= 5 },
            { name: "Reação Total", desc: "Cria uma lâmina que reflete projéteis com 200% de dano extra. Recarrega a cada 3 hordas.", apply: p => { p.hasTotalReaction = true; p.totalReactionReady = true; if(isMultiplayer) socket.emit('playerGotTotalReaction'); }, available: p => currentWave >= 13 && !p.hasTotalReaction }
        ];

        const availableOptions = allUpgrades.filter(upg => upg.available(player));
        const options = [...availableOptions].sort(() => 0.5 - Math.random()).slice(0, 4);

        options.forEach(upgrade => {
            const card = document.createElement('div'); card.className = 'upgrade-card';
            card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`;
            card.onclick = () => selectUpgrade(upgrade);
            upgradeOptionsContainer.appendChild(card);
        });
    }

    function selectUpgrade(upgrade) {
        upgrade.apply(player); 
        upgradeModal.style.display = 'none'; 
        isPaused = false;
        if (player.hasTotalReaction) totalReactionBtn.style.display = 'flex';
    }

    // --- EVENT LISTENERS ---
    window.addEventListener('resize', () => {
        resizeCanvas();
        initBackground();
    });
    window.addEventListener('keydown', (e) => { /* ... (código inalterado) ... */ });
    window.addEventListener('keyup', (e) => { /* ... (código inalterado) ... */ });
    canvas.addEventListener('mousemove', (e) => { /* ... (código inalterado) ... */ });
    canvas.addEventListener('mousedown', () => { /* ... (código inalterado) ... */ });
    window.addEventListener('mouseup', () => { /* ... (código inalterado) ... */ });

    function setupTouchControls() { /* ... (código inalterado) ... */ }
    setupTouchControls();

    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => startGame(isMultiplayer));
    backToMenuBtn.addEventListener('click', returnToMenu);
    quitBtn.addEventListener('click', returnToMenu);
    pauseBtn.addEventListener('click', () => { if (isMultiplayer) return; isPaused = !isPaused; pauseBtn.textContent = isPaused ? '▶' : '❚❚'; });
    
    rerollUpgradesBtn.addEventListener('click', () => {
        if (upgradeRerollsLeft > 0) {
            upgradeRerollsLeft--;
            rerollUpgradesBtn.textContent = `Rerolar Opções (${upgradeRerollsLeft})`;
            generateUpgradeOptions();
            if (upgradeRerollsLeft <= 0) {
                rerollUpgradesBtn.disabled = true;
            }
        }
    });

    totalReactionBtn.addEventListener('click', () => {
        if (!player || !player.totalReactionReady) return;

        player.totalReactionReady = false;
        if (isMultiplayer) {
            socket.emit('useTotalReaction');
        } else {
            activeBlades.push(new TotalReactionBlade(player));
            player.totalReactionCooldownEndWave = spState.wave + 4;
        }
    });

    showRankingBtn.addEventListener('click', async () => { /* ... (código inalterado) ... */ });
    closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');
    
    // Inicia o background
    initBackground();
    animateBackground();
});
