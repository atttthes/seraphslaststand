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
    let logicalWidth = 900, logicalHeight = 1600; // Padrão, atualizado pelo servidor
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };
    const aimStick = { active: false, angle: 0 };
    let aimAngle = 0;

    // --- ESTADO DAS HORDAS (para single-player) ---
    let spState = {
        wave: 0, waveState: 'intermission', waveTimer: 5 * 60, enemiesToSpawn: 0
    };

    // --- CONFIGURAÇÕES DO JOGO ---
    const gravity = 0.6;
    const NEON_GREEN = '#00ff7f';
    const DEFENSE_LINE_Y_RATIO = 0.65;

    // --- CONFIGS DE HORDAS (espelhado do servidor) ---
    const WAVE_CONFIG = [
        { color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3000 },
        { color: '#FF851B', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 2800 },
        { color: '#FFDC00', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 2500 },
        { color: '#7FDBFF', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2200 },
        { color: '#B10DC9', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2000 }
    ];
    const BOSS_CONFIG = {
        color: '#FFFFFF', hp: 5000, speed: 0.8, damage: 50, projectileDamage: 35, shootCooldown: 1000, width: 120, height: 120, isBoss: true
    };
    const WAVE_INTERVAL_TICKS = 20 * 60;
    const ENEMIES_PER_WAVE = [12, 18];

    // --- CLASSES DO JOGO ---
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
        }

        draw() {
            ctx.fillStyle = this.isInvincible ? 'rgba(255, 255, 255, 0.5)' : this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = 'white'; ctx.font = '20px VT323';
            ctx.textAlign = 'center'; ctx.fillText(this.name, this.x + this.width / 2, this.y - 10);
        }

        update() {
            this.draw(); this.y += this.velocityY;
            if (keys.a.pressed && this.x > 0) this.x -= this.speed;
            if (keys.d.pressed && this.x < canvas.width - this.width) this.x += this.speed;
            
            if (this.x < 0) this.x = 0;
            if (this.x > canvas.width - this.width) this.x = canvas.width - this.width;

            const groundY = canvas.height - this.height;
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
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            // Barra de vida
            const hpRatio = this.hp / this.maxHp;
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x, this.y - 10, this.width, 5);
            ctx.fillStyle = hpRatio > 0.5 ? 'lightgreen' : hpRatio > 0.2 ? 'gold' : 'red';
            ctx.fillRect(this.x, this.y - 10, this.width * hpRatio, 5);
        }

        update() {
            if (!isMultiplayer) { // Lógica de IA para Single Player
                const defenseLineY = canvas.height * DEFENSE_LINE_Y_RATIO;
                if (this.y < defenseLineY) {
                    const angle = Math.atan2(defenseLineY - this.y, player.x - this.x);
                    this.x += Math.cos(angle) * this.speed;
                    this.y += Math.sin(angle) * this.speed;
                } else {
                    this.y = defenseLineY;
                    const moveDirection = Math.sign(player.x - this.x);
                    this.x += moveDirection * this.speed;
                }
            }
            this.draw();
        }
    }
    
    class Projectile {
        constructor(x, y, angle, speed, damage, color, owner = 'player') {
            this.x = x; this.y = y; this.radius = 5;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage; this.owner = owner; this.color = color;
            if (owner !== 'player') { // Projéteis inimigos são maiores
                this.radius = 8;
            }
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
        spState = { wave: 0, waveState: 'intermission', waveTimer: 5 * 60, enemiesToSpawn: 0 };
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

            const scaleX = canvas.width / logicalWidth;
            const scaleY = canvas.height / logicalHeight;

            // Sincroniza inimigos
            const serverEnemyIds = state.enemies.map(e => e.id);
            enemies = enemies.filter(e => serverEnemyIds.includes(e.id));
            state.enemies.forEach(eData => {
                let enemy = enemies.find(e => e.id === eData.id);
                const enemyConfig = { ...eData, x: eData.x * scaleX, y: eData.y * scaleY };
                if (enemy) { Object.assign(enemy, enemyConfig); } 
                else { enemies.push(new Enemy(enemyConfig)); }
            });
            // Sincroniza projéteis inimigos
            enemyProjectiles = state.enemyProjectiles.map(p => ({ ...p, x: p.x * scaleX, y: p.y * scaleY }));

            // Sincroniza outros jogadores
            for(const id in state.players) {
                if (id === socket.id) continue;
                const pData = state.players[id];
                if(!otherPlayers[id]) {
                    otherPlayers[id] = new Player(pData.x * scaleX, pData.y * scaleY, '#999999', pData.name);
                } else {
                    otherPlayers[id].x = pData.x * scaleX; otherPlayers[id].y = pData.y * scaleY;
                    otherPlayers[id].hp = pData.hp; otherPlayers[id].name = pData.name;
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
    
    function drawBackground() {
        const groundY = canvas.height - 40;
        const brickHeight = 20; const brickWidth = 60;
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, groundY, canvas.width, 40);
        ctx.strokeStyle = NEON_GREEN; ctx.lineWidth = 1;
        for (let y = groundY, i = 0; y < canvas.height; y += brickHeight, i++) {
            const offsetX = (i % 2 === 0) ? 0 : brickWidth / 2;
            for (let x = offsetX; x < canvas.width; x += brickWidth) {
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + brickHeight); ctx.stroke();
            }
        }
        ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(canvas.width, groundY); ctx.stroke();
    }

    function updateSinglePlayerLogic() {
        spState.waveTimer--;
        // Lógica de hordas
        if (spState.waveState === 'intermission') {
            if (spState.waveTimer <= 0) {
                if (spState.wave < WAVE_CONFIG.length) {
                    spState.wave++;
                    spState.waveState = 'spawning';
                    spState.enemiesToSpawn = Math.floor(Math.random() * (ENEMIES_PER_WAVE[1] - ENEMIES_PER_WAVE[0] + 1)) + ENEMIES_PER_WAVE[0];
                } else {
                    spState.waveState = 'boss_intro';
                    spState.waveTimer = 5 * 60;
                }
            }
        } else if (spState.waveState === 'active' && enemies.length === 0) {
            spState.waveState = 'intermission';
            spState.waveTimer = WAVE_INTERVAL_TICKS;
        } else if (spState.waveState === 'boss_intro' && spState.waveTimer <= 0) {
            const bossConfig = { ...BOSS_CONFIG, id: `boss_${Date.now()}`, x: canvas.width / 2 - BOSS_CONFIG.width / 2, y: -BOSS_CONFIG.height };
            enemies.push(new Enemy(bossConfig));
            spState.waveState = 'boss_active';
        }
        
        // Spawn de inimigos
        if (spState.waveState === 'spawning' && spState.enemiesToSpawn > 0 && gameTime % 30 === 0) {
            const waveIndex = spState.wave - 1;
            const config = WAVE_CONFIG[waveIndex];
            const enemyConfig = { ...config, id: `enemy_${Date.now()}_${Math.random()}`, x: Math.random() * canvas.width, y: -50, width: 40, height: 40 };
            enemies.push(new Enemy(enemyConfig));
            spState.enemiesToSpawn--;
            if (spState.enemiesToSpawn === 0) spState.waveState = 'active';
        }

        // Disparos inimigos
        enemies.forEach(enemy => {
            const now = Date.now();
            if (now > (enemy.lastShotTime || 0) + enemy.shootCooldown) {
                enemy.lastShotTime = now;
                const angle = Math.atan2((player.y + player.height / 2) - (enemy.y + enemy.height / 2), (player.x + player.width / 2) - (enemy.x + enemy.width / 2));
                enemyProjectiles.push(new Projectile(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, angle, 5, enemy.projectileDamage, enemy.color, 'enemy'));
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
        
        if (!isMultiplayer) updateSinglePlayerLogic();

        player.update();
        if (isMultiplayer && socket) {
            socket.emit('playerUpdate', { x: player.x / (canvas.width / logicalWidth), y: player.y / (canvas.height / logicalHeight), hp: player.hp, name: player.name });
        }
        
        handleAimingAndShooting();
        Object.values(otherPlayers).forEach(p => p.draw());
        
        projectiles.forEach((p, i) => {
            p.update();
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1);
        });
        
        enemyProjectiles.forEach((p, i) => {
            if(p.update) { // Se for objeto da classe
                p.update();
            } else { // Se for objeto do servidor
                p.x += (p.vx || 0);
                p.y += (p.vy || 0);
                const proj = new Projectile(p.x, p.y, 0, 0, p.damage, p.color, 'enemy');
                proj.draw();
            }
            if (checkCollision(player, p)) player.takeDamage(p.damage);
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) enemyProjectiles.splice(i, 1);
        });

        enemies.forEach((enemy, enemyIndex) => {
            enemy.update();
            if (checkCollision(player, enemy)) player.takeDamage(enemy.damage);
            projectiles.forEach((proj, projIndex) => {
                if(proj.owner === 'player' && checkCollision(proj, enemy)) {
                    if (isMultiplayer) {
                        socket.emit('enemyHit', { enemyId: enemy.id, damage: proj.damage });
                    } else {
                        enemy.hp -= proj.damage;
                        if(enemy.hp <= 0) {
                            const expGain = enemy.isBoss ? 1000 : 50;
                            setTimeout(() => { enemies.splice(enemyIndex, 1); player.addExp(expGain); }, 0);
                        }
                    }
                    projectiles.splice(projIndex, 1);
                }
            });
        });
        
        updateUI();
    }

    function checkCollision(obj1, obj2) {
        const r1 = obj1.radius || 0; const r2 = obj2.radius || 0;
        const w1 = obj1.width || 0; const h1 = obj1.height || 0;
        const w2 = obj2.width || 0; const h2 = obj2.height || 0;
        return (obj1.x - r1 < obj2.x + (w2 || r2) && obj1.x + (w1 || r1) > obj2.x - r2 &&
                obj1.y - r1 < obj2.y + (h2 || r2) && obj1.y + (h1 || r1) > obj2.y - r2);
    }

    function updateUI() {
        if (!player) return;
        hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
        expBar.style.width = `${(player.exp / player.expToNextLevel) * 100}%`;
        timerDisplay.textContent = `Tempo: ${Math.floor(gameTime/60)}s`;
        if (spState.waveState.includes('boss')) {
            waveDisplay.textContent = "!!! CHEFE !!!";
            waveDisplay.style.color = "red";
        } else {
            waveDisplay.textContent = `Horda: ${spState.wave}`;
            waveDisplay.style.color = "white";
        }
    }
    
    async function endGame() {
        if (isGameOver) return;
        isGameOver = true; isGameRunning = false;
        finalTimeDisplay.textContent = Math.floor(gameTime/60);
        finalWaveDisplay.textContent = spState.waveState.includes('boss') ? "Chefe Final" : `Horda ${spState.wave}`;
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
            { name: "Cadência Rápida", desc: "+25% velocidade de tiro", apply: p => p.shootCooldown *= 0.75 },
            { name: "Bala Potente", desc: "+20% dano", apply: p => p.bulletDamage *= 1.2 },
            { name: "Pele de Aço", desc: "+25 HP máximo", apply: p => p.maxHp += 25 },
            { name: "Velocista", desc: "+10% velocidade de mov.", apply: p => p.speed *= 1.1 },
            { name: "Vida Extra", desc: "Cura 50% da vida máxima", apply: p => p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5)},
        ];
        const options = [...allUpgrades].sort(() => 0.5 - Math.random()).slice(0, 3);
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
            case 'Space': case 'KeyW': case 'ArrowUp': player.jump(); break;
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
            const distance = Math.min(rect.width / 2, Math.hypot(x, y));
            const angle = Math.atan2(y, x);
            state.active = true; state.angle = angle;
            knob.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
        }
        function resetJoystick(knob, state) {
            state.active = false; knob.style.transform = `translate(0px, 0px)`;
        }

        // Joystick de mira
        aimJoystick.addEventListener('touchstart', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchmove', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchend', () => resetJoystick(aimJoystickKnob, aimStick));
        
        // Botões de movimento
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
