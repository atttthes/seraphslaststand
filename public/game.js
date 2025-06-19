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
    const moveLeftBtn = document.getElementById('moveLeftBtn');
    const moveRightBtn = document.getElementById('moveRightBtn');
    const jumpBtn = document.getElementById('jumpBtn');
    const shootBtn = document.getElementById('shootBtn');

    // --- ESTADO DO JOGO ---
    let isGameRunning = false;
    let isGameOver = false;
    let isMultiplayer = false;
    let gameTime = 0;
    let animationFrameId;
    let socket;
    let playerName = "Jogador";

    let player, otherPlayers = {}, enemies = [], projectiles = [], platforms = [], particles = [];
    
    const keys = {
        a: { pressed: false },
        d: { pressed: false },
        space: { pressed: false }
    };
    const mouse = {
        x: 0,
        y: 0,
        down: false
    };

    // --- CONFIGURAÇÕES DO JOGO ---
    const gravity = 0.5;

    // --- CLASSES DO JOGO ---
    class Player {
        constructor(x, y, color = '#3498db', name = "Player") {
            this.name = name;
            this.x = x;
            this.y = y;
            this.width = 40;
            this.height = 60;
            this.color = color;
            this.velocityY = 0;
            this.speed = 5;
            this.jumpForce = 12;
            this.onGround = false;
            
            this.maxHp = 100;
            this.hp = this.maxHp;
            this.isInvincible = false;

            this.exp = 0;
            this.level = 1;
            this.expToNextLevel = 100;

            this.shootCooldown = 200; // ms
            this.lastShootTime = 0;
            this.bulletDamage = 10;
            this.bulletSpeed = 8;
        }

        draw() {
            ctx.fillStyle = this.isInvincible ? 'rgba(52, 152, 219, 0.5)' : this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            // Nome do jogador
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.name, this.x + this.width / 2, this.y - 10);
        }

        update() {
            this.draw();
            this.y += this.velocityY;

            // Movimento Horizontal
            if (keys.a.pressed && this.x > 0) this.x -= this.speed;
            if (keys.d.pressed && this.x < canvas.width - this.width) this.x += this.speed;

            // Gravidade
            if (this.y + this.height + this.velocityY < canvas.height) {
                this.velocityY += gravity;
                this.onGround = false;
            } else {
                this.velocityY = 0;
                this.onGround = true;
                this.y = canvas.height - this.height;
            }
            
            // Colisão com plataformas
            platforms.forEach(platform => {
                if (this.y + this.height <= platform.y &&
                    this.y + this.height + this.velocityY >= platform.y &&
                    this.x + this.width >= platform.x &&
                    this.x <= platform.x + platform.width) {
                    this.velocityY = 0;
                    this.onGround = true;
                    this.y = platform.y - this.height;
                }
            });
        }
        
        jump() {
            if (this.onGround) {
                this.velocityY = -this.jumpForce;
                this.onGround = false;
            }
        }

        shoot(targetX, targetY) {
            const now = Date.now();
            if (now - this.lastShootTime > this.shootCooldown) {
                this.lastShootTime = now;
                const angle = Math.atan2(targetY - (this.y + this.height / 2), targetX - (this.x + this.width / 2));
                const bullet = new Projectile(
                    this.x + this.width / 2,
                    this.y + this.height / 2,
                    angle,
                    this.bulletSpeed,
                    this.bulletDamage,
                    'player'
                );
                projectiles.push(bullet);

                if(isMultiplayer) {
                    socket.emit('playerShoot', {
                        x: bullet.x,
                        y: bullet.y,
                        angle: bullet.angle,
                        speed: bullet.speed,
                        damage: bullet.damage
                    });
                }
            }
        }
        
        takeDamage(damage) {
            if (this.isInvincible) return;
            this.hp -= damage;
            if (this.hp < 0) this.hp = 0;
            this.isInvincible = true;
            setTimeout(() => this.isInvincible = false, 500);
            updateUI();
            if (this.hp <= 0 && !isGameOver) {
                endGame();
            }
        }

        addExp(amount) {
            this.exp += amount;
            if (this.exp >= this.expToNextLevel) {
                this.levelUp();
            }
            updateUI();
        }
        
        levelUp() {
            this.exp -= this.expToNextLevel;
            this.level++;
            this.expToNextLevel = Math.floor(this.expToNextLevel * 1.5);
            this.hp = this.maxHp; // Cura ao subir de nível
            showUpgradeModal();
        }
    }

    class Enemy {
        constructor(x, y, hp, speed, damage) {
            this.id = `enemy_${Date.now()}_${Math.random()}`; // ID para multiplayer
            this.x = x;
            this.y = y;
            this.width = 35;
            this.height = 35;
            this.color = '#e74c3c';
            this.speed = speed;
            this.damage = damage;
            this.maxHp = hp;
            this.hp = hp;
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            // Barra de vida do inimigo
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y - 10, this.width, 5);
            ctx.fillStyle = 'green';
            ctx.fillRect(this.x, this.y - 10, this.width * (this.hp / this.maxHp), 5);
        }

        update() {
            // No single player, o cliente controla o inimigo
            if (!isMultiplayer) {
                if (this.y < canvas.height * 0.7) {
                    this.y += this.speed / 2;
                } else {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    this.x += Math.cos(angle) * this.speed;
                    this.y += Math.sin(angle) * this.speed;
                }
            }
            this.draw();
        }
    }

    class Projectile {
        constructor(x, y, angle, speed, damage, owner = 'player') {
            this.x = x;
            this.y = y;
            this.radius = 5;
            this.color = owner === 'player' ? '#f1c40f' : '#9b59b6';
            this.velocity = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            this.damage = damage;
            this.owner = owner;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        update() {
            this.draw();
            this.x += this.velocity.x;
            this.y += this.velocity.y;
        }
    }

    class Platform {
        constructor(x, y, width, height) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.color = '#7f8c8d';
        }
        draw() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.color = color;
            this.radius = Math.random() * 2 + 1;
            this.velocity = {
                x: (Math.random() - 0.5) * 3,
                y: (Math.random() - 0.5) * 3
            };
            this.alpha = 1;
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
        }

        update() {
            this.draw();
            this.x += this.velocity.x;
            this.y += this.velocity.y;
            this.alpha -= 0.02;
        }
    }
    
    // --- FUNÇÕES DO JOGO ---

    function init() {
        isGameOver = false;
        gameTime = 0;
        
        canvas.width = gameContainer.clientWidth;
        canvas.height = gameContainer.clientHeight;
        
        player = new Player(canvas.width / 2, canvas.height - 100, '#3498db', playerName);

        projectiles = [];
        particles = [];
        
        if (!isMultiplayer) {
            enemies = [];
        } else {
            otherPlayers = {};
        }

        platforms = [
            new Platform(0, canvas.height - 40, 200, 40),
            new Platform(canvas.width - 200, canvas.height - 40, 200, 40),
            new Platform(300, canvas.height - 150, 150, 20),
            new Platform(550, canvas.height - 250, 150, 20),
            new Platform(100, canvas.height - 350, 150, 20),
            new Platform(canvas.width - 250, canvas.height - 450, 150, 20),
        ];

        updateUI();
        gameOverModal.style.display = 'none';
        
        if (isMultiplayer) {
            connectMultiplayer();
        }
    }

    function startGame(multiplayer) {
        playerName = playerNameInput.value || "Anônimo";
        playerNameInput.disabled = true;
        isMultiplayer = multiplayer;
        
        mainMenu.style.display = 'none';
        gameContainer.style.display = 'block';

        init();
        if (!isGameRunning) {
            isGameRunning = true;
            animate();
            if (!isMultiplayer) {
                // Inicia contador de tempo e spawn de inimigos para single player
                setInterval(() => {
                    if(!isGameRunning || isGameOver) return;
                    gameTime++;
                    spawnEnemy();
                }, 1000);
            }
        }
    }

    function connectMultiplayer() {
        socket = io();

        socket.on('connect', () => {
            console.log("Conectado ao servidor multiplayer!", socket.id);
            socket.emit('joinMultiplayer', {
                name: player.name,
                x: player.x,
                y: player.y,
                hp: player.hp,
                maxHp: player.maxHp
            });
        });

        socket.on('gameState', (state) => {
            // Sincroniza o estado do jogo com o servidor
            gameTime = state.gameTime;

            // Atualiza outros jogadores
            for(const id in state.players) {
                if (id !== socket.id) {
                    const pData = state.players[id];
                    if(!otherPlayers[id]) {
                        otherPlayers[id] = new Player(pData.x, pData.y, '#2ecc71', pData.name);
                    } else {
                        otherPlayers[id].x = pData.x;
                        otherPlayers[id].y = pData.y;
                        otherPlayers[id].hp = pData.hp;
                    }
                }
            }

            // Atualiza inimigos (servidor é a fonte da verdade)
            enemies = state.enemies.map(eData => {
                const existing = enemies.find(e => e.id === eData.id);
                if (existing) {
                    existing.x = eData.x;
                    existing.y = eData.y;
                    existing.hp = eData.hp;
                    return existing;
                }
                return new Enemy(eData.x, eData.y, eData.hp, eData.speed, eData.damage);
            });
        });
        
        socket.on('playerShot', (bulletData) => {
            projectiles.push(new Projectile(bulletData.x, bulletData.y, bulletData.angle, bulletData.speed, bulletData.damage, 'other_player'));
        });
        
        socket.on('enemyDied', ({ enemyId, killerId }) => {
            enemies = enemies.filter(e => e.id !== enemyId);
            if(killerId === socket.id || killerId !== socket.id) { // EXP Compartilhada
                player.addExp(50);
            }
        });

        socket.on('playerLeft', (id) => {
            delete otherPlayers[id];
        });
    }

    function spawnEnemy() {
        const hp = 100 + gameTime * 2;
        const speed = 1 + gameTime * 0.02;
        const damage = 10 + gameTime * 0.1;
        const x = Math.random() * canvas.width;
        enemies.push(new Enemy(x, 0, hp, speed, damage));
    }

    function animate() {
        if (isGameOver) {
            cancelAnimationFrame(animationFrameId);
            isGameRunning = false;
            return;
        }
        animationFrameId = requestAnimationFrame(animate);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Desenha plataformas
        platforms.forEach(p => p.draw());

        // Atualiza e desenha jogador principal
        player.update();
        if (isMultiplayer && socket) {
            socket.emit('playerUpdate', { x: player.x, y: player.y, hp: player.hp });
        }

        // Atualiza e desenha outros jogadores (multiplayer)
        for (const id in otherPlayers) {
            otherPlayers[id].draw();
        }

        // Atualiza e desenha particulas
        particles.forEach((p, i) => {
            if(p.alpha <= 0) particles.splice(i, 1);
            else p.update();
        });

        // Atualiza e desenha projéteis
        projectiles.forEach((p, i) => {
            p.update();
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
                projectiles.splice(i, 1);
            }
        });
        
        // Atualiza e desenha inimigos
        enemies.forEach((enemy, enemyIndex) => {
            enemy.update();

            // Colisão: Inimigo vs Jogador
            if (checkCollision(player, enemy)) {
                player.takeDamage(enemy.damage);
                for (let i = 0; i < 10; i++) particles.push(new Particle(player.x + player.width/2, player.y + player.height/2, 'red'));
            }
            
            // Colisão: Projétil vs Inimigo
            projectiles.forEach((proj, projIndex) => {
                if(proj.owner === 'player' && checkCollision(proj, enemy)) {
                    for (let i = 0; i < 5; i++) particles.push(new Particle(proj.x, proj.y, 'orange'));
                    
                    if (isMultiplayer) {
                        socket.emit('enemyHit', { enemyId: enemy.id, damage: proj.damage });
                    } else {
                        enemy.hp -= proj.damage;
                        if(enemy.hp <= 0) {
                            setTimeout(() => {
                                enemies.splice(enemyIndex, 1);
                                player.addExp(50);
                            }, 0);
                        }
                    }
                    projectiles.splice(projIndex, 1);
                }
            });
        });
        
        updateUI();
    }

    function checkCollision(obj1, obj2) {
        // Simples AABB (Axis-Aligned Bounding Box)
        const obj1Radius = obj1.radius || 0;
        const obj2Radius = obj2.radius || 0;
        
        return (
            obj1.x - obj1Radius < obj2.x + obj2.width &&
            obj1.x + (obj1.width || obj1Radius) > obj2.x &&
            obj1.y - obj1Radius < obj2.y + obj2.height &&
            obj1.y + (obj1.height || obj1Radius) > obj2.y
        );
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
        
        // Salva pontuação no ranking
        try {
            await fetch('/api/ranking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName, timeSurvived: Math.floor(gameTime) })
            });
        } catch (error) {
            console.error("Falha ao salvar pontuação:", error);
        }
    }

    // --- LÓGICA DE UPGRADES ---
    const allUpgrades = [
        { name: "Cadência Rápida", desc: "+25% velocidade de tiro", apply: p => p.shootCooldown *= 0.75 },
        { name: "Bala Potente", desc: "+20% dano de tiro", apply: p => p.bulletDamage *= 1.2 },
        { name: "Pele de Aço", desc: "+25 HP máximo", apply: p => p.maxHp += 25 },
        { name: "Velocista", desc: "+10% velocidade de movimento", apply: p => p.speed *= 1.1 },
        { name: "Salto Duplo", desc: "Ainda não implementado", apply: p => {} }, // Exemplo
        { name: "Vida Extra", desc: "Cura 50% da vida máxima", apply: p => p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5)},
    ];
    
    function showUpgradeModal() {
        isGameRunning = false; // Pausa o jogo
        upgradeOptionsContainer.innerHTML = '';
        const options = [];
        while(options.length < 3 && options.length < allUpgrades.length) {
            const randomUpgrade = allUpgrades[Math.floor(Math.random() * allUpgrades.length)];
            if(!options.includes(randomUpgrade)) options.push(randomUpgrade);
        }
        
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
        isGameRunning = true;
        if (!isGameOver) animate(); // Retoma o jogo
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
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    
    canvas.addEventListener('mousedown', () => {
        if (!isGameRunning) return;
        mouse.down = true;
        // Tiro contínuo
        const shootInterval = setInterval(() => {
            if (mouse.down && isGameRunning) {
                player.shoot(mouse.x, mouse.y);
            } else {
                clearInterval(shootInterval);
            }
        }, 50);
        player.shoot(mouse.x, mouse.y); // Atira imediatamente ao clicar
    });
    
    canvas.addEventListener('mouseup', () => mouse.down = false);
    
    // Touch
    let shootTouchInterval;
    moveLeftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.a.pressed = true; });
    moveLeftBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys.a.pressed = false; });
    moveRightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.d.pressed = true; });
    moveRightBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys.d.pressed = false; });
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); player.jump(); });
    
    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        mouse.down = true;
        shootTouchInterval = setInterval(() => {
            if(mouse.down && isGameRunning) player.shoot(mouse.x, mouse.y);
        }, 50);
    });
    shootBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        mouse.down = false;
        clearInterval(shootTouchInterval);
    });
    // Apontar com toque na tela
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.touches[0].clientX - rect.left;
        mouse.y = e.touches[0].clientY - rect.top;
    });
     canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.touches[0].clientX - rect.left;
        mouse.y = e.touches[0].clientY - rect.top;
    });


    // Botões do Menu e Modais
    startSinglePlayerBtn.addEventListener('click', () => startGame(false));
    startMultiplayerBtn.addEventListener('click', () => startGame(true));
    restartBtn.addEventListener('click', () => {
        startGame(isMultiplayer); // Reinicia no mesmo modo
    });
    backToMenuBtn.addEventListener('click', () => {
        gameOverModal.style.display = 'none';
        mainMenu.style.display = 'flex';
        gameContainer.style.display = 'none';
        playerNameInput.disabled = false;
    });
    
    showRankingBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/ranking');
            const scores = await res.json();
            rankingTableBody.innerHTML = ''; // Limpa a tabela
            scores.forEach((score, index) => {
                const row = document.createElement('tr');
                const date = new Date(score.date).toLocaleDateString('pt-BR');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${score.name}</td>
                    <td>${score.timeSurvived}</td>
                    <td>${date}</td>
                `;
                rankingTableBody.appendChild(row);
            });
            rankingModal.style.display = 'flex';
        } catch (error) {
            alert("Não foi possível carregar o ranking.");
            console.error(error);
        }
    });

    closeRankingBtn.addEventListener('click', () => {
        rankingModal.style.display = 'none';
    });
});
