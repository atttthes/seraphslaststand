// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;

// --- Configuração do Express ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Servir o index.html a partir do diretório raiz do projeto, não de 'public'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Servir os arquivos estáticos (js, css) do diretório raiz
app.use(express.static(__dirname));

// --- API para o Ranking ---
app.get('/api/ranking', async (req, res) => {
    try {
        const scores = await db.getTopScores(10);
        res.json(scores);
    } catch (error) {
        console.error("Erro ao buscar ranking:", error);
        res.status(500).json({ message: "Erro ao buscar ranking", error });
    }
});

app.post('/api/ranking', async (req, res) => {
    try {
        const { name, timeSurvived } = req.body;
        if (!name || typeof timeSurvived !== 'number') {
            return res.status(400).json({ message: "Nome e tempo são obrigatórios." });
        }
        const result = await db.addScore(name, timeSurvived);
        res.status(201).json(result);
    } catch (error) {
        console.error("Erro ao salvar pontuação:", error);
        res.status(500).json({ message: "Erro ao salvar pontuação", error });
    }
});

// --- Lógica do Multiplayer com Socket.IO ---
const rooms = {};
const MAX_PLAYERS_PER_ROOM = 4;
const LOGICAL_WIDTH = 900;
const LOGICAL_HEIGHT = 1600;
const GAME_TICK_RATE = 1000 / 60; // 60 updates per second
const ENEMY_SHOOT_DELAY_TICKS = 18; // 0.3s * 60fps

// --- Constantes de Posição ---
const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5;
const BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3;
const RICOCHET_LINE_Y = 180;
const SNIPER_LINE_Y = 80;

// --- Configurações das Hordas e Inimigos ---
const WAVE_CONFIG = [
    { type: 'basic', color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3600 },
    { type: 'basic', color: '#FF4136', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 3360 },
    { type: 'basic', color: '#FF4136', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 3000 },
    { type: 'basic', color: '#FF4136', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2640 },
    { type: 'basic', color: '#FF4136', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2400 }
];
const BOSS_CONFIG = {
    type: 'boss', color: '#FFFFFF', hp: 500, speed: 0.8, damage: 50, projectileDamage: 35, shootCooldown: 1440, width: 120, height: 120, isBoss: true
};
const RICOCHET_CONFIG = { 
    type: 'ricochet', color: '#FF69B4', hp: 250, speed: 1.2, horizontalSpeed: 0.6, projectileDamage: 20, shootCooldown: 4200, isRicochet: true, width: 35, height: 35 
};
const SNIPER_CONFIG = {
    type: 'sniper', color: '#00FFFF', speed: 1.0, horizontalSpeed: 0.5, isSniper: true, width: 25, height: 50
};
const WAVE_INTERVAL_SECONDS = 10;

// --- Função para escalar dificuldade ---
function getScalingFactor(wave) {
    if (wave <= 1) return 1.0;
    return 1.0 + Math.min(0.5, (wave - 1) * 0.1);
}

function getWaveConfig(wave) {
    const baseConfig = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1];
    const scalingFactor = getScalingFactor(wave);
    return { 
        ...baseConfig, 
        hp: Math.floor(baseConfig.hp * scalingFactor), 
        damage: Math.floor(baseConfig.damage * scalingFactor), 
        projectileDamage: Math.floor(baseConfig.projectileDamage * scalingFactor) 
    };
}

function getBossConfig(wave) {
    const scalingFactor = getScalingFactor(wave);
    return { 
        ...BOSS_CONFIG, 
        hp: Math.floor(BOSS_CONFIG.hp * scalingFactor), 
        damage: Math.floor(BOSS_CONFIG.damage * scalingFactor), 
        projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scalingFactor) 
    };
}

function getRicochetConfig(wave) {
    const scalingFactor = getScalingFactor(wave);
    return { 
        ...RICOCHET_CONFIG, 
        hp: Math.floor(RICOCHET_CONFIG.hp * scalingFactor), 
        projectileDamage: Math.floor(RICOCHET_CONFIG.projectileDamage * scalingFactor) 
    };
}

function findOrCreateRoom() {
    for (const roomName in rooms) {
        if (Object.keys(rooms[roomName].players).length < MAX_PLAYERS_PER_ROOM) {
            return roomName;
        }
    }
    const newRoomName = `room_${Date.now()}`;
    rooms[newRoomName] = {
        players: {}, enemies: [], enemyProjectiles: [],
        lightningStrikes: [], 
        gameTime: 0, wave: 0, waveState: 'intermission', waveTimer: 5,
        classShootingCooldowns: { basic: 0, sniper: 0, ricochet: 0, boss: 0 },
        bladeHits: {} // Rastrear acertos da lâmina por jogador por horda
    };
    console.log(`Nova sala criada: ${newRoomName}`);
    return newRoomName;
}

function spawnEnemy(room, waveConfig) {
    room.enemies.push({
        id: `enemy_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 40), y: -50,
        width: 40, height: 40, ...waveConfig, maxHp: waveConfig.hp,
        lastShotTime: 0, patrolOriginX: null, reachedPosition: false,
        horizontalSpeed: waveConfig.speed / 2,
    });
}

function spawnSniper(room, waveConfig) {
    const baseDamage = waveConfig.damage;
    const baseProjDamage = waveConfig.projectileDamage;
    const sniper = {
        id: `sniper_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 25), y: -50,
        ...SNIPER_CONFIG,
        hp: waveConfig.hp * 0.8, maxHp: waveConfig.hp * 0.8,
        damage: baseDamage * 0.5, 
        projectileDamage: baseProjDamage * 1.15,
        shootCooldown: waveConfig.shootCooldown * 1.30 * 1.2,
        lastShotTime: 0, patrolOriginX: null, reachedPosition: false,
    };
    room.enemies.push(sniper);
}

function spawnRicochet(room, wave) {
    const ricochetConfig = getRicochetConfig(wave);
    room.enemies.push({
        id: `ricochet_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - ricochetConfig.width), y: -50,
        ...ricochetConfig, maxHp: ricochetConfig.hp, lastShotTime: 0,
        patrolOriginX: null, reachedPosition: false,
    });
}

function spawnBoss(room, wave) {
    const bossConfig = getBossConfig(wave);
    room.enemies.push({
        id: `boss_${Date.now()}_${Math.random()}`,
        x: LOGICAL_WIDTH / 2 - bossConfig.width / 2, y: -bossConfig.height,
        ...bossConfig, horizontalSpeed: bossConfig.speed, speed: 1.2,
        maxHp: bossConfig.hp, lastShotTime: 0,
        patrolOriginX: null, reachedPosition: false,
    });
}

function shootForEnemy(enemy, room, targetPlayer) {
    if (!targetPlayer) return;
    
    const now = Date.now();
    enemy.lastShotTime = now;
    let projectile = {
        id: `ep_${now}_${Math.random()}`,
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
        damage: enemy.projectileDamage,
        color: enemy.color,
        originId: enemy.id // Important for reflection
    };

    if (enemy.isRicochet) {
        const wallX = (targetPlayer.x > enemy.x) ? LOGICAL_WIDTH : 0;
        const virtualPlayerX = (wallX === 0) ? -targetPlayer.x : (2 * LOGICAL_WIDTH - targetPlayer.x);
        const angle = Math.atan2((targetPlayer.y + 30) - projectile.y, (virtualPlayerX + 20) - projectile.x);
        projectile.vx = Math.cos(angle) * 8;
        projectile.vy = Math.sin(angle) * 8;
        projectile.canRicochet = true;
        projectile.bouncesLeft = 1;
    } else {
        const angle = Math.atan2((targetPlayer.y + 30) - projectile.y, (targetPlayer.x + 20) - projectile.x);
        const speed = enemy.isSniper ? 7 : 5;
        projectile.vx = Math.cos(angle) * speed;
        projectile.vy = Math.sin(angle) * speed;
    }
    room.enemyProjectiles.push(projectile);
}

// Game loop do servidor
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        const playerList = Object.values(room.players);

        if (playerList.length === 0) {
            console.log(`Deletando sala vazia: ${roomName}`);
            delete rooms[roomName];
            continue;
        }

        room.gameTime++;

        // LÓGICA DE HORDAS
        if (room.gameTime > 1 && room.gameTime % 60 === 0) {
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    room.wave++; room.waveState = 'active';
                    room.bladeHits = {}; // Limpa os registros de acertos da lâmina para a nova horda
                    io.to(roomName).emit('waveStart', room.wave);
                    const waveConfig = getWaveConfig(room.wave);
                    
                    const normalEnemyCount = room.wave + 1; 
                    for (let i = 0; i < normalEnemyCount; i++) {
                        setTimeout(() => { if (rooms[roomName]) spawnEnemy(room, waveConfig); }, i * 250);
                    }
                    if (room.wave >= 3) {
                        const sniperCount = 1 + Math.floor((room.wave - 3) / 2);
                        for (let i = 0; i < sniperCount; i++) spawnSniper(room, waveConfig);
                    }
                    if (room.wave >= 7 && (room.wave - 7) % 2 === 0) {
                        const ricochetCount = Math.floor((room.wave - 7) / 2) + 1;
                        for (let i = 0; i < ricochetCount; i++) spawnRicochet(room, room.wave);
                    }
                    if (room.wave >= 10 && (room.wave - 10) % 3 === 0) {
                        const bossCount = Math.floor((room.wave - 10) / 3) + 1;
                        for (let i = 0; i < bossCount; i++) spawnBoss(room, room.wave);
                    }
                }
            } else if (room.waveState === 'active' && room.enemies.length === 0) {
                console.log(`Sala ${roomName} limpou a horda ${room.wave}`);
                room.waveState = 'intermission';
                room.waveTimer = WAVE_INTERVAL_SECONDS;
            }
        }
        
        // --- LÓGICA DO RAIO (ATUALIZADA) ---
        const LIGHTNING_INTERVAL_TICKS = Math.round(9 * (1000 / GAME_TICK_RATE));
        const LIGHTNING_DAMAGE = WAVE_CONFIG[0].hp; // 120
        const LIGHTNING_VISUAL_DURATION_TICKS = 30; // 0.5s

        room.lightningStrikes = room.lightningStrikes.filter(strike => 
            room.gameTime < strike.creationTime + LIGHTNING_VISUAL_DURATION_TICKS
        );
        
        if (room.gameTime > 1 && room.gameTime % LIGHTNING_INTERVAL_TICKS === 0) {
            const lightningPlayers = playerList.filter(p => p.hasLightning);
            lightningPlayers.forEach(player => {
                for (let i = 0; i < 3; i++) {
                    const strikeX = Math.random() * LOGICAL_WIDTH;
                    const strikeWidth = 40 * 1.2;
                    room.lightningStrikes.push({
                        id: `strike_${Date.now()}_${Math.random()}`, x: strikeX, width: strikeWidth, creationTime: room.gameTime,
                    });
                    room.enemies.forEach(enemy => {
                        if (enemy.x + enemy.width > strikeX - strikeWidth / 2 && enemy.x < strikeX + strikeWidth / 2) {
                            enemy.hp -= LIGHTNING_DAMAGE;
                        }
                    });
                }
                room.enemies = room.enemies.filter(enemy => {
                    if (enemy.hp <= 0) {
                        const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                        io.to(roomName).emit('enemyDied', { enemyId: enemy.id, killerId: player.id, expGain });
                        return false;
                    }
                    return true;
                });
            });
        }
        
        // IA DOS INIMIGOS
        room.enemies.forEach(enemy => {
            const targetPlayer = playerList.length > 0 ? playerList.sort((a, b) => Math.hypot(enemy.x - a.x, enemy.y - a.y) - Math.hypot(enemy.x - b.x, enemy.y - b.y))[0] : null;
            
            let targetY;
            if (enemy.isSniper) targetY = SNIPER_LINE_Y;
            else if (enemy.isRicochet) targetY = RICOCHET_LINE_Y;
            else if (enemy.isBoss) targetY = BOSS_LINE_Y;
            else targetY = DEFENSE_LINE_Y;

            if (!enemy.reachedPosition) {
                if (enemy.y < targetY) { enemy.y += enemy.speed; } 
                else { 
                    enemy.y = targetY; 
                    enemy.baseY = targetY;
                    enemy.reachedPosition = true; 
                    enemy.patrolOriginX = enemy.x; 
                }
            } else {
                 // Efeito de flutuação vertical
                if (enemy.baseY) {
                    const phase = enemy.id.charCodeAt(enemy.id.length - 1) || 0;
                    enemy.y = enemy.baseY + Math.sin(room.gameTime * 0.05 + phase) * 5;
                }
                const patrolSpeed = enemy.horizontalSpeed || enemy.speed / 2;
                if (targetPlayer && !enemy.isRicochet) {
                     const moveDirection = Math.sign(targetPlayer.x - enemy.x);
                     enemy.x += moveDirection * patrolSpeed;
                }
                const patrolRange = LOGICAL_WIDTH * (enemy.isBoss ? 0.3 : 0.1);
                const leftBoundary = enemy.patrolOriginX - (patrolRange / 2);
                const rightBoundary = enemy.patrolOriginX + (patrolRange / 2);
                if (enemy.x < leftBoundary) enemy.x = leftBoundary;
                if (enemy.x > rightBoundary - enemy.width) enemy.x = rightBoundary - enemy.width;
            }
            if (enemy.x < 0) enemy.x = 0;
            if (enemy.x > LOGICAL_WIDTH - enemy.width) enemy.x = LOGICAL_WIDTH - enemy.width;
            
            const now = Date.now();
            if (enemy.reachedPosition && now > (enemy.lastShotTime || 0) + enemy.shootCooldown) {
                const enemyType = enemy.type;
                if(room.gameTime >= (room.classShootingCooldowns[enemyType] || 0)) {
                    shootForEnemy(enemy, room, targetPlayer);
                    room.classShootingCooldowns[enemyType] = room.gameTime + ENEMY_SHOOT_DELAY_TICKS;
                }
            }
        });

        // Projéteis inimigos
        for (let i = room.enemyProjectiles.length - 1; i >= 0; i--) {
            const p = room.enemyProjectiles[i];
            
            if (p.canRicochet && p.bouncesLeft > 0) {
                if (p.x <= 0 || p.x >= LOGICAL_WIDTH) { p.vx *= -1; p.bouncesLeft--; p.x = p.x <= 0 ? 1 : LOGICAL_WIDTH - 1; }
            }
            
            p.x += p.vx; p.y += p.vy;

            if (p.y > LOGICAL_HEIGHT + 50 || p.y < -50 || p.x < -50 || p.x > LOGICAL_WIDTH + 50) {
                room.enemyProjectiles.splice(i, 1); continue;
            }
            for (const player of playerList) {
                if (p.x > player.x && p.x < player.x + 40 && p.y > player.y && p.y < player.y + 60) {
                    io.to(player.id).emit('playerHit', p.damage);
                    room.enemyProjectiles.splice(i, 1); break; 
                }
            }
        }

        io.to(roomName).emit('gameState', room);
    }
}, GAME_TICK_RATE);


io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('joinMultiplayer', (playerData) => {
        const roomName = findOrCreateRoom();
        socket.join(roomName);
        socket.room = roomName;

        const room = rooms[roomName];
        room.players[socket.id] = { 
            id: socket.id, ...playerData, 
            hasAlly: false, allyCooldownWave: 0, hasLightning: false,
            hasTotalReaction: false,
        };
        console.log(`Jogador ${playerData.name || 'Anônimo'} (${socket.id}) entrou na sala ${roomName}.`);
        socket.emit('roomJoined', { logicalWidth: LOGICAL_WIDTH, logicalHeight: LOGICAL_HEIGHT });
    });

    socket.on('playerUpdate', (data) => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id] = { ...room.players[socket.id], ...data };
        }
    });

    socket.on('playerShoot', (bulletData) => {
        if(socket.room) socket.to(socket.room).emit('playerShot', bulletData);
    });

    socket.on('enemyHit', ({ enemyId, damage, isReflected }) => {
        const room = rooms[socket.room];
        if (!room) return;
        const player = room.players[socket.id];
        
        if (isReflected && (!player || !player.hasTotalReaction)) {
             console.log(`Tentativa de dano refletido inválida por ${player.name}`);
             return;
        }

        const enemy = room.enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp -= damage;
            if (enemy.hp <= 0) {
                room.enemies = room.enemies.filter(e => e.id !== enemyId);
                const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id, expGain });
            }
        }
    });
    
    socket.on('bladeHitEnemy', (enemyId) => {
        const room = rooms[socket.room];
        if (!room) return;
        const player = room.players[socket.id];
        const enemy = room.enemies.find(e => e.id === enemyId);

        if (player && player.hasTotalReaction && enemy) {
            // Verifica se o jogador já usou a lâmina nesta horda para evitar spam
            if(room.bladeHits[socket.id]) return;
            
            enemy.hp -= 300;
            if (enemy.hp <= 0) {
                 room.enemies = room.enemies.filter(e => e.id !== enemyId);
                 const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                 io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id, expGain });
            }
        }
    });
    
    // Marcar que o jogador usou a habilidade nesta horda
    socket.on('playerUsedTotalReaction', () => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id] && room.players[socket.id].hasTotalReaction) {
            room.bladeHits[socket.id] = true;
        }
    });

    socket.on('enemyProjectileDestroyed', (projectileId) => {
        const room = rooms[socket.room];
        if (room) {
            room.enemyProjectiles = room.enemyProjectiles.filter(p => p.id !== projectileId);
        }
    });

    socket.on('playerGotAlly', () => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id].hasAlly = true;
        }
    });

    socket.on('playerLostAlly', () => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id].hasAlly = false;
            room.players[socket.id].allyCooldownWave = room.wave + 2;
        }
    });
    
    socket.on('playerGotLightning', () => {
        const room = rooms[socket.room];
        if (!room || !room.players[socket.id]) return;
        room.players[socket.id].hasLightning = true;
    });

    socket.on('playerGotTotalReaction', () => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id].hasTotalReaction = true;
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        const roomName = socket.room;
        if (roomName && rooms[roomName]) {
            delete rooms[roomName].players[socket.id];
            delete rooms[roomName].bladeHits[socket.id]; // Limpa registro de lâmina
            io.to(roomName).emit('playerLeft', socket.id);
            if (Object.keys(rooms[roomName].players).length === 0) {
                 console.log(`Sala ${roomName} está vazia, será removida.`);
            }
        }
    });
});


// --- Inicialização do Servidor ---
async function startServer() {
    try {
        await db.connect();
        server.listen(PORT, () => {
            console.log(`Servidor rodando com sucesso na porta ${PORT}`);
        });
    } catch (err) {
        console.error("FALHA CRÍTICA: Não foi possível conectar ao MongoDB. O servidor não irá iniciar.", err);
        process.exit(1);
    }
}

startServer();
