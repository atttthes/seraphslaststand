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

    // Controles Touch
    const touchLeftBtn = document.getElementById('touchLeft');
    const touchRightBtn = document.getElementById('touchRight');
    const touchJumpBtn = document.getElementById('touchJump');
    const touchShootBtn = document.getElementById('touchShoot');


    // --- ESTADO DO JOGO ---
    let isGameRunning = false;
    let isPaused = false;
    let isGameOver = false;
    let isMultiplayer = false;
    let gameTime = 0;
    let animationFrameId;
    let singlePlayerIntervalId;
    let socket;
    let playerName = "Jogador";

    let player, otherPlayers = {}, enemies = [], projectiles = [], platforms = [], particles = [];
    
    const keys = { a: { pressed: false }, d: { pressed: false } };
    const mouse = { x: 0, y: 0, down: false };

    // --- CONFIGURAÇÕES DO JOGO ---
    const gravity = 0.5;
    const NEON_GREEN = '#00ff7f';
    const STROKE_WIDTH = 2;

    // --- CLASSES DO JOGO ---
    class Player {
        constructor(x, y, color = NEON_GREEN, name = "Player") {
            this.name = name;
            this.x = x; this.y = y;
            this.width = 40; this.height = 60;
            this.color = color;
            this.velocityY = 0;
            this.speed = 5;
            this.jumpForce = 12;
            this.onGround = false;
            this.direction = 1; // 1 para direita, -1 para esquerda
            
            this.maxHp = 100; this.hp = this.maxHp;
            this.isInvincible = false;

            this.exp = 0; this.level = 1;
            this.expToNextLevel = 100;

            this.shootCooldown = 200;
            this.lastShootTime = 0;
            this.bulletDamage = 10;
            this.bulletSpeed = 8;
        }

        draw() {
            ctx.strokeStyle = this.isInvincible ? 'rgba(0, 255, 127, 0.5)' : this.color;
            ctx.lineWidth = STROKE_WIDTH;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            // Nome do jogador
            ctx.fillStyle = 'white';
            ctx.font = '20px VT323';
            ctx.textAlign = 'center';
            ctx.fillText(this.name, this.x + this.width / 2, this.y - 10);
        }

        update() {
            this.draw();
            this.y += this.velocityY;

            if (keys.a.pressed && this.x > 0) {
                this.x -= this.speed;
                this.direction = -1;
            }
            if (keys.d.pressed && this.x < canvas.width - this.width) {
                this.x += this.speed;
                this.direction = 1;
            }

            // Colisão com o chão
            if (this.y + this.height + this.velocityY >= canvas.height) {
                this.velocityY = 0;
                this.onGround = true;
                this.y = canvas.height - this.height;
            } else {
                this.velocityY += gravity;
                this.onGround = false;
            }
        }
        
        jump() {
            if (this.onGround) { this.velocityY = -this.jumpForce; this.onGround = false; }
        }

        shoot(targetX, targetY) {
            const now = Date.now();
            if (now - this.lastShootTime > this.shootCooldown) {
                this.lastShootTime = now;
                const angle = Math.atan2(targetY - (this.y + this.height / 2), targetX - (this.x + this.width / 2));
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
            this.width = 35; this.height = 35;
            this.speed = speed; this.damage = damage;
            this.maxHp = hp; this.hp = hp;
        }

        draw() {
            ctx.strokeStyle = NEON_GREEN;
            ctx.lineWidth = STROKE_WIDTH;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            // Barra de vida
            ctx.strokeStyle = 'rgba(0, 255, 127, 0.3)';
            ctx.strokeRect(this.x, this.y - 10, this.width, 5);
            ctx.fillStyle = NEON_GREEN;
            ctx.fillRect(this.x, this.y - 10, this.width * (this.hp / this.maxHp), 5);
        }

        update() {
            if (!isMultiplayer) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
            }
            this.draw();
        }
    }

    class Projectile {
        constructor(x, y, angle, speed, damage, owner = 'player') {
            this.x = x; this.y = y;
            this.radius = 5;
            this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            this.damage = damage;
            this.owner = owner;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = NEON_GREEN;
            ctx.lineWidth = STROKE_WIDTH;
            ctx.stroke();
        }

        update() { this.draw(); this.x += this.velocity.x; this.y += this.velocity.y; }
    }
    
    // --- FUNÇÕES DO JOGO ---
    function cleanup() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (singlePlayerIntervalId) clearInterval(singlePlayerIntervalId);
        if (socket) socket.disconnect();
        
        animationFrameId = null;
        singlePlayerIntervalId = null;
        socket = null;
        
        isGameRunning = false;
        isPaused = false;
    }

    function returnToMenu() {
        cleanup();
        gameOverModal.style.display = 'none';
        gameContainer.style.display = 'none';
        mainMenu.style.display = 'flex';
        playerNameInput.disabled = false;
    }

    function init() {
        cleanup();
        isGameOver = false;
        gameTime = 0;
        
        canvas.width = 1600; // Mapa mais largo
        canvas.height = 800;
        
        player = new Player(canvas.width / 2, canvas.height - 100, NEON_GREEN, playerName);
        projectiles = []; enemies = []; particles = []; otherPlayers = {};

        platforms = []; // Removemos as plataformas, deixando apenas o chão.

        updateUI();
        gameOverModal.style.display = 'none';
        
        if (isMultiplayer) {
            connectMultiplayer();
            pauseBtn.style.display = 'none';
        } else {
            pauseBtn.style.display = 'block';
            pauseBtn.textContent = '❚❚';
        }
    }

    function startGame(multiplayer) {
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
                if (gameTime % 4 === 0) spawnEnemy();
            }, 1000);
        }
    }

    function connectMultiplayer() {
        socket = io();
        socket.on('connect', () => {
            console.log("Conectado! ID:", socket.id);
            socket.emit('joinMultiplayer', { name: player.name, x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp });
        });

        socket.on('gameState', (state) => {
            gameTime = state.gameTime;
            // Sincroniza inimigos
            enemies = state.enemies.map(eData => {
                const existing = enemies.find(e => e.id === eData.id);
                if (existing) {
                    existing.x = eData.x; existing.y = eData.y; existing.hp = eData.hp;
                    return existing;
                }
                return new Enemy(eData.x, eData.y, eData.hp, eData.speed, eData.damage, eData.id);
            });
            // Sincroniza outros jogadores
            for(const id in state.players) {
                if (id === socket.id) continue;
                const pData = state.players[id];
                if(!otherPlayers[id]) {
                    otherPlayers[id] = new Player(pData.x, pData.y, '#00e676', pData.name); // Cor diferente para amigos
                } else {
                    otherPlayers[id].x = pData.x; otherPlayers[id].y = pData.y; otherPlayers[id].hp = pData.hp;
                }
            }
        });
        
        socket.on('playerShot', (bulletData) => projectiles.push(new Projectile(bulletData.x, bulletData.y, bulletData.angle, bulletData.speed, bulletData.damage, 'other_player')));
        
        socket.on('enemyDied', ({ enemyId, killerId }) => {
            enemies = enemies.filter(e => e.id !== enemyId);
            player.addExp(50); // EXP compartilhada
        });

        socket.on('playerLeft', (id) => delete otherPlayers[id]);
    }

    function spawnEnemy() {
        const hp = 100 + gameTime * 2;
        const speed = 0.5 + gameTime * 0.01;
        const damage = 10 + gameTime * 0.1;
        const side = Math.random() < 0.5 ? 0 - 50 : canvas.width + 50; // Nasce fora da tela
        const y = Math.random() * (canvas.height - 200); // Evita nascer no chão
        enemies.push(new Enemy(side, y, hp, speed, damage));
    }


    function animate() {
        if (isGameOver) {
            cleanup();
            return;
        }
        animationFrameId = requestAnimationFrame(animate);

        if (isPaused) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        platforms.forEach(p => p.draw());
        player.update();
        if (isMultiplayer && socket) socket.emit('playerUpdate', { x: player.x, y: player.y, hp: player.hp });
        
        Object.values(otherPlayers).forEach(p => p.draw());
        
        projectiles.forEach((p, i) => {
            p.update();
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1);
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

    function checkCollision(obj1, obj2) {
        const r1 = obj1.radius || 0, r2 = obj2.radius || 0;
        return (obj1.x - r1 < obj2.x + obj2.width && obj1.x + (obj1.width || r1) > obj2.x && obj1.y - r1 < obj2.y + obj2.height && obj1.y + (obj1.height || r1) > obj2.y);
    }
    
    function updateUI() {
        if (!player) return;
        hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
        expBar.style.width = `${(player.exp / player.expToNextLevel) * 100}%`;
        timerDisplay.textContent = `Tempo: ${Math.floor(gameTime)}s`;
    }

    async function endGame() {
        if (isGameOver) return;
        isGameOver = true;
        isGameRunning = false;
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

    function showUpgradeModal() {
        isPaused = true; // Pausa o jogo
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
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`;
            card.onclick = () => selectUpgrade(upgrade);
            upgradeOptionsContainer.appendChild(card);
        });
        upgradeModal.style.display = 'flex';
    }
    
    function selectUpgrade(upgrade) {
        upgrade.apply(player);
        upgradeModal.style.display = 'none';
        isPaused = false; // Retoma o jogo
    }

    // --- EVENT LISTENERS ---
    // Teclado
    window.addEventListener('keydown', (e) => {
        if (!isGameRunning) return;
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
    // Mouse
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    canvas.addEventListener('mousedown', () => { if (isGameRunning && !isPaused) player.shoot(mouse.x, mouse.y); });

    // Controles de Toque
    touchLeftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.a.pressed = true; });
    touchLeftBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys.a.pressed = false; });
    touchRightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.d.pressed = true; });
    touchRightBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys.d.pressed = false; });
    touchJumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (isGameRunning && !isPaused) player.jump(); });
    touchShootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isGameRunning && !isPaused) {
            // Atira na direção que o jogador está "olhando"
            const targetX = player.x + player.width / 2 + (100 * player.direction);
            const targetY = player.y + player.height / 2;
            player.shoot(targetX, targetY);
        }
    });


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
    
    showRankingBtn.addEventListener('click', async () => {
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
