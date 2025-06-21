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
const GAME_TICK_RATE = 1000 / 60;

// --- Constantes de Posição ---
const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5;
const BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3;
const RICOCHET_LINE_Y = 180;
const SNIPER_LINE_Y = 80;

// --- Configurações das Hordas e Inimigos ---
const WAVE_CONFIG = [
    { color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3000 },
    { color: '#FF851B', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 2800 },
    { color: '#FFDC00', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 2500 },
    { color: '#7FDBFF', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2200 },
    { color: '#B10DC9', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2000 }
];
const BOSS_CONFIG = {
    color: '#FFFFFF', hp: 1040, speed: 0.8, damage: 50, projectileDamage: 35, shootCooldown: 1200, width: 120, height: 120, isBoss: true
};
const RICOCHET_CONFIG = { 
    color: '#FF69B4', hp: 250, speed: 1.2, horizontalSpeed: 0.6, projectileDamage: 20, shootCooldown: 3500, isRicochet: true, width: 35, height: 35 
};
const WAVE_INTERVAL_SECONDS = 15;

// --- Função para escalar dificuldade ---
function getScalingFactor(wave) {
    if (wave <= 1) return 1.0;
    // Aumento de 10% por horda após a primeira, com um teto de 50% de bônus (atingido na horda 6)
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
        lightningStrikes: [], // Para o novo item Raio
        gameTime: 0, wave: 0, waveState: 'intermission', waveTimer: 5,
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
    room.enemies.push({
        id: `sniper_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 25), y: -50,
        width: 25, height: 50, color: '#00FFFF',
        hp: waveConfig.hp * 0.8, speed: 1.0, horizontalSpeed: 0.5,
        damage: waveConfig.damage * 0.5, projectileDamage: waveConfig.projectileDamage * 1.15,
        shootCooldown: waveConfig.shootCooldown * 1.30,
        isSniper: true, maxHp: waveConfig.hp * 0.8, lastShotTime: 0,
        patrolOriginX: null, reachedPosition: false,
    });
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
                    const waveConfig = getWaveConfig(room.wave);
                    
                    const normalEnemyCount = room.wave + 2;
                    for (let i = 0; i < normalEnemyCount; i++) {
                        setTimeout(() => { if (rooms[roomName]) spawnEnemy(room, waveConfig); }, i * 250);
                    }
                    if (room.wave >= 3) {
                        const sniperCount = 1 + (room.wave - 3) * 2;
                        for (let i = 0; i < sniperCount; i++) spawnSniper(room, waveConfig);
                    }
                    if (room.wave >= 4 && (room.wave - 4) % 3 === 0) {
                        const ricochetCount = Math.floor((room.wave - 4) / 3) + 1;
                        for (let i = 0; i < ricochetCount; i++) spawnRicochet(room, room.wave);
                    }
                    if (room.wave >= 6 && (room.wave - 6) % 2 === 0) { // Aparição a partir da horda 6
                        const bossCount = Math.floor((room.wave - 6) / 2) + 1;
                        for (let i = 0; i < bossCount; i++) spawnBoss(room, room.wave);
                    }

                }
            } else if (room.waveState === 'active' && room.enemies.length === 0) {
                console.log(`Sala ${roomName} limpou a horda ${room.wave}`);
                room.waveState = 'intermission';
                room.waveTimer = WAVE_INTERVAL_SECONDS;
            }
        }
        
        // --- LÓGICA DO RAIO ---
        const LIGHTNING_INTERVAL_TICKS = Math.round(7 * (1000 / GAME_TICK_RATE));
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
                        io.to(room.name).emit('enemyDied', { enemyId: enemy.id, killerId: player.id, expGain });
                        return false;
                    }
                    return true;
                });
            });
        }


        // IA DOS INIMIGOS
        room.enemies.forEach(enemy => {
            const targetPlayer = playerList.length > 0 ? playerList.sort((a, b) => Math.hypot(enemy.x - a.x, enemy.y - a.y) - Math.hypot(enemy.x - b.x, enemy.y - b.y))[0] : null;
            let canShoot = false;

            let targetY;
            if (enemy.isSniper) targetY = SNIPER_LINE_Y;
            else if (enemy.isRicochet) targetY = RICOCHET_LINE_Y;
            else if (enemy.isBoss) targetY = BOSS_LINE_Y;
            else targetY = DEFENSE_LINE_Y;

            if (!enemy.reachedPosition) {
                if (enemy.y < targetY) { enemy.y += enemy.speed; } 
                else { enemy.y = targetY; enemy.reachedPosition = true; enemy.patrolOriginX = enemy.x; }
            } else {
                canShoot = true;
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
            if (canShoot && now > (enemy.lastShotTime || 0) + enemy.shootCooldown) {
                if (enemy.isRicochet && targetPlayer) {
                    enemy.lastShotTime = now;
                    // IA de Ricochete: Calcula tiro na parede para acertar o jogador "virtual"
                    const wallX = (targetPlayer.x > enemy.x) ? LOGICAL_WIDTH : 0;
                    const virtualPlayerX = (wallX === 0) ? -targetPlayer.x : (2 * LOGICAL_WIDTH - targetPlayer.x);
                    const virtualPlayerY = targetPlayer.y;

                    const angle = Math.atan2(
                        (virtualPlayerY + 30) - (enemy.y + enemy.height / 2), 
                        (virtualPlayerX + 20) - (enemy.x + enemy.width / 2)
                    );
                    room.enemyProjectiles.push({
                        id: `ep_${Date.now()}_${Math.random()}`, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2,
                        vx: Math.cos(angle) * 8, vy: Math.sin(angle) * 8,
                        damage: enemy.projectileDamage, color: enemy.color,
                        canRicochet: true, bouncesLeft: 1
                    });
                } else if (targetPlayer) {
                    enemy.lastShotTime = now;
                    const angle = Math.atan2((targetPlayer.y + 30) - (enemy.y + enemy.height / 2), (targetPlayer.x + 20) - (enemy.x + enemy.width / 2));
                    room.enemyProjectiles.push({
                        id: `ep_${now}_${Math.random()}`, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2,
                        vx: Math.cos(angle) * 7, vy: Math.sin(angle) * 7,
                        damage: enemy.projectileDamage, color: enemy.color
                    });
                }
            }
        });

        // Projéteis inimigos
        for (let i = room.enemyProjectiles.length - 1; i >= 0; i--) {
            const p = room.enemyProjectiles[i];
            
            if (p.canRicochet && p.bouncesLeft > 0) {
                if (p.x <= 0 || p.x >= LOGICAL_WIDTH) {
                    p.vx *= -1;
                    p.bouncesLeft--;
                    p.x = p.x <= 0 ? 1 : LOGICAL_WIDTH - 1;
                }
            }
            
            p.x += p.vx;
            p.y += p.vy;

            if (p.y > LOGICAL_HEIGHT + 50 || p.y < -50 || p.x < -50 || p.x > LOGICAL_WIDTH + 50) {
                room.enemyProjectiles.splice(i, 1);
                continue;
            }
            for (const player of playerList) {
                if (p.x > player.x && p.x < player.x + 40 && p.y > player.y && p.y < player.y + 60) {
                    io.to(player.id).emit('playerHit', p.damage);
                    room.enemyProjectiles.splice(i, 1);
                    break; 
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
            id: socket.id, 
            ...playerData, 
            hasAlly: false, 
            allyCooldownWave: 0,
            hasLightning: false 
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

    socket.on('enemyHit', ({ enemyId, damage }) => {
        const room = rooms[socket.room];
        if (!room) return;

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

        const lightningPlayerCount = Object.values(room.players).filter(p => p.hasLightning).length;
        if (lightningPlayerCount < 2) {
            room.players[socket.id].hasLightning = true;
            console.log(`Jogador ${socket.id} ativou o upgrade Raio. Total na sala: ${lightningPlayerCount + 1}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        const roomName = socket.room;
        if (roomName && rooms[roomName]) {
            delete rooms[roomName].players[socket.id];
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
