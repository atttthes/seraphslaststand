// game.js
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const mainMenu = document.getElementById('mainMenu');
    const gameContainer = document.getElementById('gameContainer');
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // ... (outros elementos do DOM)
    const playerNameInput = document.getElementById('playerNameInput');
    const startSinglePlayerBtn = document.getElementById('startSinglePlayerBtn');
    const startMultiplayerBtn = document.getElementById('startMultiplayerBtn');
    const showRankingBtn = document.getElementById('showRankingBtn');
    const hpBar = document.getElementById('hpBar');
    const expBar = document.getElementById('expBar');
    const timerDisplay = document.getElementById('timer');
    const pauseBtn = document.getElementById('pauseBtn');
    const quitBtn = document.getElementById('quitBtn');
    const gameOverModal = document.getElementById('gameOverModal');
    const finalTimeDisplay = document.getElementById('finalTime');
    const restartBtn = document.getElementById('restartBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const upgradeModal = document.getElementById('upgradeModal');
    const upgradeOptionsContainer = document.getElementById('upgradeOptions');
    const rankingModal = document.getElementById('rankingModal');
    const rankingTableBody = document.querySelector('#rankingTable tbody');
    const closeRankingBtn = document.getElementById('closeRankingBtn');

    // Controles Touch (Joysticks)
    const moveJoystick = document.getElementById('moveJoystick');
    const moveJoystickKnob = document.getElementById('moveJoystickKnob');
    const aimJoystick = document.getElementById('aimJoystick');
    const aimJoystickKnob = document.getElementById('aimJoystickKnob');
    const touchJumpBtn = document.getElementById('touchJump');

    // --- ESTADO DO JOGO ---
    let isGameRunning = false, isPaused = false, isGameOver = false, isMultiplayer = false;
    let gameTime = 0, animationFrameId, singlePlayerIntervalId, socket, playerName = "Jogador";
    let player, otherPlayers = {}, enemies = [], projectiles = [], particles = [];
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };
    
    // Estado dos Joysticks
    const moveStick = { active: false, angle: 0 };
    const aimStick = { active: false, angle: 0 };
    let aimAngle = 0;

    // --- CONFIGURAÇÕES DO JOGO ---
    const gravity = 0.6;
    const NEON_GREEN = '#00ff7f';
    const STROKE_WIDTH = 2;
    const DEFENSE_LINE_Y_RATIO = 0.65; // Onde os inimigos param

    // --- CLASSES DO JOGO ---
    class Player {
        constructor(x, y, color = 'white', name = "Player") {
            this.name = name;
            this.x = x; this.y = y;
            this.width = 40; this.height = 60;
            this.color = color;
            this.velocityY = 0;
            this.speed = 5;
            this.jumpForce = 15;
            this.onGround = false;
            
            this.maxHp = 100; this.hp = this.maxHp;
            this.isInvincible = false;

            this.exp = 0; this.level = 1; this.expToNextLevel = 100;
            
            this.shootCooldown = 250; this.lastShootTime = 0;
            this.bulletDamage = 10; this.bulletSpeed = 10;
        }

        draw() {
            this.drawTrashCan(); // NOVO: Desenha a lata de lixo
            // Nome do jogador
            ctx.fillStyle = 'white';
            ctx.font = '20px VT323';
            ctx.textAlign = 'center';
            ctx.fillText(this.name, this.x + this.width / 2, this.y - 10);
        }

        // NOVO: Método para desenhar a lata de lixo em pixel art
        drawTrashCan() {
            ctx.fillStyle = this.isInvincible ? 'rgba(255, 255, 255, 0.5)' : this.color;
            const x = Math.round(this.x);
            const y = Math.round(this.y);
            
            // Corpo (32x48)
            ctx.fillRect(x + 4, y + 12, 32, 48);
            // Tampa (40x8)
            ctx.fillRect(x, y + 4, 40, 8);
            // Alça da tampa (16x4)
            ctx.fillRect(x + 12, y, 16, 4);
            // Linhas de detalhe
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(x + 10, y + 20, 4, 30);
            ctx.fillRect(x + 26, y + 20, 4, 30);
        }

        update() {
            this.draw();
            this.y += this.velocityY;

            // Movimento pelo teclado
            if (keys.a.pressed && this.x > 0) this.x -= this.speed;
            if (keys.d.pressed && this.x < canvas.width - this.width) this.x += this.speed;

            // Movimento pelo joystick
            if (moveStick.active) {
                const moveSpeed = this.speed * (window.innerWidth < 768 ? 1.2 : 1.0); // Aumenta a sensibilidade no mobile
                this.x += Math.cos(moveStick.angle) * moveSpeed;
            }
            
            // Limites da tela
            if (this.x < 0) this.x = 0;
            if (this.x > canvas.width - this.width) this.x = canvas.width - this.width;

            // Colisão com o chão
            const groundY = canvas.height - this.height;
            if (this.y + this.velocityY >= groundY) {
                this.velocityY = 0;
                this.onGround = true;
                this.y = groundY;
            } else {
                this.velocityY += gravity;
                this.onGround = false;
            }
        }
        
        jump() { if (this.onGround) { this.velocityY = -this.jumpForce; this.onGround = false; } }

        shoot(angle) { // ATUALIZADO: Recebe o ângulo diretamente
            const now = Date.now();
            if (now - this.lastShootTime > this.shootCooldown) {
                this.lastShootTime = now;
                const bullet = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.bulletSpeed, this.bulletDamage, 'player');
                projectiles.push(bullet);
                if(isMultiplayer) socket.emit('playerShoot', { x: bullet.x, y: bullet.y, angle: bullet.angle, speed: bullet.speed, damage: bullet.damage });
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
            this.exp -= this.expToNextLevel;
            this.level++;
            this.expToNextLevel = Math.floor(this.expToNextLevel * 1.5);
            this.hp = this.maxHp;
            showUpgradeModal();
        }
    }

    class Enemy {
         constructor(x, y, hp, speed, damage, id) {
            this.id = id || `enemy_${Date.now()}_${Math.random()}`;
            this.x = x; this.y = y;
            this.width = 40; this.height = 40;
            this.speed = speed; this.damage = damage;
            this.maxHp = hp; this.hp = hp;
        }

        draw() {
            ctx.strokeStyle = NEON_GREEN; ctx.lineWidth = STROKE_WIDTH;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            // Olhos do inimigo
            ctx.fillStyle = NEON_GREEN;
            ctx.fillRect(this.x + 8, this.y + 12, 8, 8);
            ctx.fillRect(this.x + 24, this.y + 12, 8, 8);
            // Barra de vida
            ctx.strokeStyle = 'rgba(0, 255, 127, 0.3)';
            ctx.strokeRect(this.x, this.y - 10, this.width, 5);
            ctx.fillStyle = NEON_GREEN;
            ctx.fillRect(this.x, this.y - 10, this.width * (this.hp / this.maxHp), 5);
        }

        update() {
            if (!isMultiplayer) { // Lógica de IA para Single Player
                const targetX = player.x;
                const defenseLineY = canvas.height * DEFENSE_LINE_Y_RATIO;

                if (this.y >= defenseLineY) {
                    const angle = Math.atan2(0, targetX - this.x);
                    this.x += Math.cos(angle) * this.speed;
                } else {
                    const angle = Math.atan2(defenseLineY - this.y, targetX - this.x);
                    this.x += Math.cos(angle) * this.speed;
                    this.y += Math.sin(angle) * this.speed;
                }
            }
            this.draw();
        }
    }
    
    class Projectile { /* ... (sem alterações) ... */ 
        constructor(x, y, angle, speed, damage, owner = 'player') {
            this.x = x; this.y = y; this.radius = 5;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage; this.owner = owner;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = NEON_GREEN; ctx.lineWidth = STROKE_WIDTH;
            ctx.stroke();
        }
        update() { this.draw(); this.x += this.velocity.x; this.y += this.velocity.y; }
    }
    
    // --- FUNÇÕES DO JOGO ---
    function cleanup() { /* ... (sem alterações) ... */ 
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (singlePlayerIntervalId) clearInterval(singlePlayerIntervalId);
        if (socket) socket.disconnect();
        animationFrameId = null; singlePlayerIntervalId = null; socket = null;
        isGameRunning = false; isPaused = false;
    }

    function returnToMenu() { /* ... (sem alterações) ... */
        cleanup();
        gameOverModal.style.display = 'none';
        gameContainer.style.display = 'none';
        mainMenu.style.display = 'flex';
        playerNameInput.disabled = false;
    }

    function init() {
        cleanup();
        isGameOver = false; gameTime = 0;
        
        resizeCanvas(); // NOVO: Redimensiona o canvas ao iniciar
        
        player = new Player(canvas.width / 2, canvas.height - 100, 'white', playerName);
        projectiles = []; enemies = []; particles = []; otherPlayers = {};
        
        updateUI();
        gameOverModal.style.display = 'none';
        
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

    function startGame(multiplayer) { /* ... (sem alterações) ... */
        playerName = playerNameInput.value || "Anônimo";
        isMultiplayer = multiplayer;
        mainMenu.style.display = 'none';
        gameContainer.style.display = 'block';
        init();
        isGameRunning = true;
        animate();
        if (!isMultiplayer) {
            singlePlayerIntervalId = setInterval(() => {
                if(!isGameRunning || isGameOver || isPaused) return;
                gameTime++;
                if (gameTime > 1 && gameTime % 3 === 0) spawnEnemy();
            }, 1000);
        }
    }

    function connectMultiplayer() { /* ... (sem alterações na maior parte) ... */
        socket = io();
        socket.on('connect', () => {
            console.log("Conectado! ID:", socket.id);
            socket.emit('joinMultiplayer', { name: player.name, x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp });
        });
        socket.on('gameState', (state) => {
            gameTime = state.gameTime;
            // Sincroniza inimigos
            const serverEnemyIds = state.enemies.map(e => e.id);
            enemies = enemies.filter(e => serverEnemyIds.includes(e.id));
            state.enemies.forEach(eData => {
                let enemy = enemies.find(e => e.id === eData.id);
                if (enemy) {
                    enemy.x = eData.x * (canvas.width / 900); // Mapeia a coord. do servidor para a tela do cliente
                    enemy.y = eData.y * (canvas.height / 1600);
                    enemy.hp = eData.hp;
                } else {
                    enemies.push(new Enemy(eData.x * (canvas.width / 900), eData.y * (canvas.height / 1600), eData.hp, eData.speed, eData.damage, eData.id));
                }
            });
            // Sincroniza outros jogadores
            for(const id in state.players) {
                if (id === socket.id) continue;
                const pData = state.players[id];
                if(!otherPlayers[id]) {
                    otherPlayers[id] = new Player(pData.x, pData.y, '#999999', pData.name);
                } else {
                    otherPlayers[id].x = pData.x * (canvas.width / 900);
                    otherPlayers[id].y = pData.y * (canvas.height / 1600);
                    otherPlayers[id].hp = pData.hp;
                }
            }
        });
        socket.on('playerShot', (bulletData) => projectiles.push(new Projectile(bulletData.x * (canvas.width / 900), bulletData.y * (canvas.height / 1600), bulletData.angle, bulletData.speed, bulletData.damage, 'other_player')));
        socket.on('enemyDied', ({ enemyId, killerId }) => {
            enemies = enemies.filter(e => e.id !== enemyId);
            if(killerId === socket.id || isMultiplayer) player.addExp(50);
        });
        socket.on('playerLeft', (id) => delete otherPlayers[id]);
    }

    function spawnEnemy() {
        const hp = 100 + gameTime * 2.5;
        const speed = 0.8 + gameTime * 0.01;
        const damage = 10 + gameTime * 0.1;
        const x = Math.random() * canvas.width;
        const y = -50; // Nasce no topo
        enemies.push(new Enemy(x, y, hp, speed, damage));
    }

    function handleAimingAndShooting() {
        let isAiming = false;
        
        // Mira com o Joystick
        if (aimStick.active) {
            isAiming = true;
            aimAngle = aimStick.angle;
        } 
        // Mira com o Mouse
        else if (mouse.down) {
            isAiming = true;
            aimAngle = Math.atan2(mouse.y - (player.y + player.height / 2), mouse.x - (player.x + player.width / 2));
        }

        if (isAiming) {
            player.shoot(aimAngle);
            // Desenha a linha da mira
            ctx.beginPath();
            ctx.moveTo(player.x + player.width / 2, player.y + player.height / 2);
            ctx.lineTo(
                player.x + player.width / 2 + Math.cos(aimAngle) * 1000,
                player.y + player.height / 2 + Math.sin(aimAngle) * 1000
            );
            ctx.strokeStyle = 'rgba(0, 255, 127, 0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function animate() {
        if (isGameOver) { cleanup(); return; }
        animationFrameId = requestAnimationFrame(animate);
        if (isPaused) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        player.update();
        if (isMultiplayer && socket) {
            // Envia coords normalizadas para o servidor
            socket.emit('playerUpdate', { 
                x: player.x / (canvas.width / 900), 
                y: player.y / (canvas.height / 1600), 
                hp: player.hp 
            });
        }
        
        handleAimingAndShooting(); // NOVO: Gerencia mira e tiro
        
        Object.values(otherPlayers).forEach(p => p.draw());
        
        projectiles.forEach((p, i) => {
            p.update();
            if (p.x < -10 || p.x > canvas.width + 10 || p.y < -10 || p.y > canvas.height + 10) projectiles.splice(i, 1);
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
                            setTimeout(() => { enemies.splice(enemyIndex, 1); player.addExp(50); }, 0);
                        }
                    }
                    projectiles.splice(projIndex, 1);
                }
            });
        });
        
        updateUI();
    }

    function checkCollision(obj1, obj2) { /* ... (sem alterações) ... */ 
         const r1 = obj1.radius || 0, r2 = obj2.radius || 0;
        return (obj1.x - r1 < obj2.x + obj2.width && obj1.x + (obj1.width || r1) > obj2.x && obj1.y - r1 < obj2.y + obj2.height && obj1.y + (obj1.height || r1) > obj2.y);
    }
    function updateUI() { /* ... (sem alterações) ... */ 
        if (!player) return;
        hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
        expBar.style.width = `${(player.exp / player.expToNextLevel) * 100}%`;
        timerDisplay.textContent = `Tempo: ${Math.floor(gameTime)}s`;
    }
    async function endGame() { /* ... (sem alterações) ... */ 
        if (isGameOver) return;
        isGameOver = true; isGameRunning = false;
        finalTimeDisplay.textContent = Math.floor(gameTime);
        gameOverModal.style.display = 'flex';
        try {
            await fetch('/api/ranking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName, timeSurvived: Math.floor(gameTime) })
            });
        } catch (error) { console.error("Falha ao salvar pontuação:", error); }
    }
    function showUpgradeModal() { /* ... (sem alterações) ... */ 
        isPaused = true;
        upgradeOptionsContainer.innerHTML = '';
        const allUpgrades = [
            { name: "Cadência Rápida", desc: "+25% velocidade de tiro", apply: p => p.shootCooldown *= 0.75 },
            { name: "Bala Potente", desc: "+20% dano", apply: p => p.bulletDamage *= 1.2 },
            { name: "Pele de Aço", desc: "+25 HP máximo", apply: p => p.maxHp += 25 },
            { name: "Velocista", desc: "+10% velocidade", apply: p => p.speed *= 1.1 },
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
    function selectUpgrade(upgrade) { /* ... (sem alterações) ... */
        upgrade.apply(player); upgradeModal.style.display = 'none'; isPaused = false;
    }

    // --- EVENT LISTENERS ---
    window.addEventListener('resize', resizeCanvas); // NOVO: Listener de redimensionamento
    
    // Teclado
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
    // Mouse (com tiro automático)
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    canvas.addEventListener('mousedown', () => { if (isGameRunning && !isPaused) mouse.down = true; });
    window.addEventListener('mouseup', () => { mouse.down = false; }); // Listener na janela para pegar o mouseup fora do canvas

    // --- LÓGICA DOS JOYSTICKS DE TOQUE ---
    function setupTouchControls() {
        function handleJoystick(e, stick, knob, state) {
            e.preventDefault();
            const rect = stick.getBoundingClientRect();
            const touch = e.touches[0];

            let x = touch.clientX - rect.left - rect.width / 2;
            let y = touch.clientY - rect.top - rect.height / 2;

            const distance = Math.min(rect.width / 2, Math.hypot(x, y));
            const angle = Math.atan2(y, x);
            
            state.active = true;
            state.angle = angle;
            
            const knobX = Math.cos(angle) * distance;
            const knobY = Math.sin(angle) * distance;
            knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
        }

        function resetJoystick(knob, state) {
            state.active = false;
            knob.style.transform = `translate(0px, 0px)`;
        }

        moveJoystick.addEventListener('touchstart', (e) => handleJoystick(e, moveJoystick, moveJoystickKnob, moveStick), { passive: false });
        moveJoystick.addEventListener('touchmove', (e) => handleJoystick(e, moveJoystick, moveJoystickKnob, moveStick), { passive: false });
        moveJoystick.addEventListener('touchend', () => resetJoystick(moveJoystickKnob, moveStick));

        aimJoystick.addEventListener('touchstart', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchmove', (e) => handleJoystick(e, aimJoystick, aimJoystickKnob, aimStick), { passive: false });
        aimJoystick.addEventListener('touchend', () => resetJoystick(aimJoystickKnob, aimStick));
        
        touchJumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (player && !isPaused) player.jump(); });
    }
    setupTouchControls();

    // Botões
    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => startGame(isMultiplayer));
    backToMenuBtn.addEventListener('click', returnToMenu);
    quitBtn.addEventListener('click', returnToMenu);
    pauseBtn.addEventListener('click', () => {
        if (isMultiplayer) return;
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶' : '❚❚';
    });
    
    // Ranking
    showRankingBtn.addEventListener('click', async () => { /* ... (sem alterações) ... */
        try {
            const res = await fetch('/api/ranking');
            const scores = await res.json();
            rankingTableBody.innerHTML = '';
            scores.forEach((score, index) => {
                const row = document.createElement('tr');
                const date = new Date(score.date).toLocaleDateString('pt-BR');
                row.innerHTML = `<td>${index + 1}</td><td>${score.name}</td><td>${score.timeSurvived}</td><td>${date}</td>`;
                rankingTableBody.appendChild(row);
            });
            rankingModal.style.display = 'flex';
        } catch (error) {
            alert("Não foi possível carregar o ranking.");
            console.error(error);
        }
    });
    closeRankingBtn.addEventListener('click', () => rankingModal.style.display = 'none');
});
