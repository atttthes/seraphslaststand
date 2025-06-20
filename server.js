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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// --- ATUALIZADO: Constantes de Posição ---
const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5;
const BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3;
const SNIPER_LINE_Y = 80; // Posição dos snipers mais abaixo

const ENEMY_SPAWN_INTERVAL_TICKS = 3 * (1000 / GAME_TICK_RATE);

// --- Configurações das Hordas e Chefe ---
const WAVE_CONFIG = [
    { color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3000 }, // Horda 1
    { color: '#FF851B', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 2800 }, // Horda 2
    { color: '#FFDC00', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 2500 }, // Horda 3
    { color: '#7FDBFF', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2200 }, // Horda 4
    { color: '#B10DC9', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2000 }  // Horda 5+ (base)
];
const BOSS_CONFIG = {
    color: '#FFFFFF', hp: 4000, speed: 0.8, damage: 50, projectileDamage: 35, shootCooldown: 1200, width: 120, height: 120, isBoss: true
};
const WAVE_INTERVAL_SECONDS = 15;
const ENEMIES_PER_WAVE = [10, 15];

// --- NOVO: Função para escalar dificuldade em hordas infinitas ---
function getWaveConfig(wave) {
    const baseConfig = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1];
    const scalingFactor = 1 + (Math.max(0, wave - WAVE_CONFIG.length) * 0.1); // Aumenta 10% a cada horda após a 5ª
    return {
        ...baseConfig,
        hp: Math.floor(baseConfig.hp * scalingFactor),
        damage: Math.floor(baseConfig.damage * scalingFactor),
        projectileDamage: Math.floor(baseConfig.projectileDamage * scalingFactor)
    };
}
function getBossConfig(wave) {
    const scalingFactor = 1 + (Math.max(0, wave - 4) * 0.15); // Chefes escalam 15% por horda
    return {
        ...BOSS_CONFIG,
        hp: Math.floor(BOSS_CONFIG.hp * scalingFactor),
        damage: Math.floor(BOSS_CONFIG.damage * scalingFactor),
        projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scalingFactor)
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
        players: {},
        enemies: [],
        enemyProjectiles: [],
        gameTime: 0,
        wave: 0,
        waveState: 'intermission', // intermission, active
        waveTimer: 5,
        enemiesToSpawn: 0,
        spawnCooldown: 0,
    };
    console.log(`Nova sala criada: ${newRoomName}`);
    return newRoomName;
}

function spawnEnemy(room, waveConfig) {
    const enemy = {
        id: `enemy_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 40),
        y: -50,
        width: 40, height: 40,
        ...waveConfig,
        maxHp: waveConfig.hp,
        lastShotTime: 0,
    };
    room.enemies.push(enemy);
}

function spawnSniper(room, waveConfig) {
    const sniper = {
        id: `sniper_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 25),
        y: -50, // Nasce no topo e se move para a SNIPER_LINE_Y
        width: 25, height: 50,
        color: '#00FFFF',
        hp: waveConfig.hp * 0.8,
        speed: 1.0, // Velocidade para chegar na posição
        horizontalSpeed: 0.5, // Velocidade de movimento lateral
        damage: waveConfig.damage * 0.5,
        projectileDamage: waveConfig.projectileDamage * 1.15,
        shootCooldown: waveConfig.shootCooldown * 1.30,
        isSniper: true,
        maxHp: waveConfig.hp * 0.8,
        lastShotTime: 0,
    };
    room.enemies.push(sniper);
}

function spawnBoss(room, wave) {
    const bossConfig = getBossConfig(wave);
    const boss = {
        id: `boss_${Date.now()}_${Math.random()}`,
        x: LOGICAL_WIDTH / 2 - bossConfig.width / 2,
        y: -bossConfig.height, // Nasce no topo
        ...bossConfig,
        horizontalSpeed: bossConfig.speed, // Renomeado para clareza
        speed: 1.2, // Velocidade para descer até a posição
        maxHp: bossConfig.hp,
        lastShotTime: 0,
    };
    room.enemies.push(boss);
}

// Game loop do servidor: A fonte da verdade
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

        // --- ATUALIZADO: LÓGICA DE HORDAS INFINITAS ---
        if (room.gameTime > 1 && room.gameTime % 60 === 0) { // Lógica de timer a cada segundo
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    // Inicia nova horda
                    room.wave++;
                    room.waveState = 'active';
                    const waveConfig = getWaveConfig(room.wave);
                    
                    // Spawna inimigos normais
                    room.enemiesToSpawn = Math.floor(Math.random() * (ENEMIES_PER_WAVE[1] - ENEMIES_PER_WAVE[0] + 1)) + ENEMIES_PER_WAVE[0] + room.wave;
                    room.spawnCooldown = 0;

                    // Spawna Snipers a partir da horda 2
                    if (room.wave >= 2) {
                        const sniperCount = Math.min(8, (room.wave - 1) * 2); // Limita a 8 snipers
                        for (let i = 0; i < sniperCount; i++) {
                            spawnSniper(room, waveConfig);
                        }
                    }
                    
                    // Spawna Chefes a partir da horda 5
                    if (room.wave >= 5) {
                        const bossCount = room.wave - 4;
                        for (let i = 0; i < bossCount; i++) {
                            spawnBoss(room, room.wave);
                        }
                    }
                }
            } else if (room.waveState === 'active' && room.enemies.length === 0 && room.enemiesToSpawn === 0) {
                console.log(`Sala ${roomName} limpou a horda ${room.wave}`);
                room.waveState = 'intermission';
                room.waveTimer = WAVE_INTERVAL_SECONDS;
            }
        }

        // SPAWN PERIÓDICO DE INIMIGOS TERRESTRES
        if (room.waveState === 'active' && room.enemiesToSpawn > 0) {
            room.spawnCooldown--;
            if (room.spawnCooldown <= 0) {
                spawnEnemy(room, getWaveConfig(room.wave));
                room.enemiesToSpawn--;
                room.spawnCooldown = ENEMY_SPAWN_INTERVAL_TICKS / (1 + room.wave * 0.05); // Aumenta a velocidade de spawn com o tempo
            }
        }

        // --- ATUALIZADO: IA DOS INIMIGOS ---
        room.enemies.forEach(enemy => {
            const targetPlayer = playerList.length > 0 ? playerList.sort((a, b) => Math.hypot(enemy.x - a.x, enemy.y - a.y) - Math.hypot(enemy.x - b.x, enemy.y - b.y))[0] : null;
            let canShoot = false;

            if (enemy.isSniper) {
                if (enemy.y < SNIPER_LINE_Y) { // Move para a posição
                    enemy.y += enemy.speed;
                } else {
                    enemy.y = SNIPER_LINE_Y;
                    canShoot = true;
                    if (targetPlayer) {
                        const moveDirection = Math.sign(targetPlayer.x - enemy.x);
                        if (Math.abs(targetPlayer.x - enemy.x) > enemy.horizontalSpeed * 5) {
                            enemy.x += moveDirection * enemy.horizontalSpeed;
                        }
                    }
                }
            } else if (enemy.isBoss) {
                if (enemy.y < BOSS_LINE_Y) { // Move para a posição
                    enemy.y += enemy.speed;
                } else {
                    enemy.y = BOSS_LINE_Y;
                    canShoot = true;
                    // Movimento horizontal do chefe
                     if (targetPlayer) {
                         const moveDirection = Math.sign(targetPlayer.x - enemy.x);
                        if (moveDirection !== 0 && Math.abs(targetPlayer.x - enemy.x) > enemy.horizontalSpeed) {
                           enemy.x += moveDirection * enemy.horizontalSpeed;
                        }
                    }
                }
            } else { // Inimigos terrestres
                if (enemy.y < DEFENSE_LINE_Y) {
                    enemy.y += enemy.speed;
                } else {
                    enemy.y = DEFENSE_LINE_Y;
                    canShoot = true;
                    if (targetPlayer) {
                        const moveDirection = Math.sign(targetPlayer.x - enemy.x);
                        if (moveDirection !== 0 && Math.abs(targetPlayer.x - enemy.x) > enemy.speed) {
                           enemy.x += moveDirection * enemy.speed;
                        }
                    }
                }
            }
            // Evitar que inimigos saiam da tela
            if (enemy.x < 0) enemy.x = 0;
            if (enemy.x > LOGICAL_WIDTH - enemy.width) enemy.x = LOGICAL_WIDTH - enemy.width;
            
            // Lógica de Disparo
            if (canShoot && targetPlayer) {
                const now = Date.now();
                if (now > (enemy.lastShotTime || 0) + enemy.shootCooldown) {
                    enemy.lastShotTime = now;
                    const angle = Math.atan2((targetPlayer.y + 30) - (enemy.y + enemy.height / 2), (targetPlayer.x + 20) - (enemy.x + enemy.width / 2));
                    room.enemyProjectiles.push({
                        id: `ep_${now}_${Math.random()}`,
                        x: enemy.x + enemy.width / 2,
                        y: enemy.y + enemy.height / 2,
                        vx: Math.cos(angle) * 7,
                        vy: Math.sin(angle) * 7,
                        damage: enemy.projectileDamage,
                        color: enemy.color,
                        isSniper: !!enemy.isSniper
                    });
                }
            }
        });

        // Projéteis inimigos
        for (let i = room.enemyProjectiles.length - 1; i >= 0; i--) {
            const p = room.enemyProjectiles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.y > LOGICAL_HEIGHT || p.x < 0 || p.x > LOGICAL_WIDTH || p.y < 0) {
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
        room.players[socket.id] = { id: socket.id, ...playerData };
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
                const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : 50);
                io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id, expGain });
            }
        }
    });

    // --- NOVO: Evento para registrar a interceptação de projéteis ---
    socket.on('enemyProjectileDestroyed', (projectileId) => {
        const room = rooms[socket.room];
        if (room) {
            room.enemyProjectiles = room.enemyProjectiles.filter(p => p.id !== projectileId);
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
