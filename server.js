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
const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5;
const GAME_TICK_RATE = 1000 / 60;
const ENEMY_SPAWN_INTERVAL_TICKS = 3 * (1000 / GAME_TICK_RATE);

// --- Configurações das Hordas e Chefe ---
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
const WAVE_INTERVAL_SECONDS = 20;
const ENEMIES_PER_WAVE = [12, 18];

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
        waveState: 'intermission', // intermission, active, boss_intro, boss_active
        waveTimer: 5,
        enemiesToSpawn: 0,
        spawnCooldown: 0,
    };
    console.log(`Nova sala criada: ${newRoomName}`);
    return newRoomName;
}

function spawnEnemy(room) {
    const waveIndex = room.wave > 0 ? room.wave - 1 : 0;
    const config = WAVE_CONFIG[waveIndex];
    const enemy = {
        id: `enemy_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 40),
        y: -50,
        width: 40, height: 40,
        ...config,
        maxHp: config.hp,
        lastShotTime: 0,
    };
    room.enemies.push(enemy);
}

// *** NOVO: Função para spawnar Snipers ***
function spawnSniper(room, waveIndex) {
    const baseConfig = WAVE_CONFIG[waveIndex];
    const sniper = {
        id: `sniper_${Date.now()}_${Math.random()}`,
        x: Math.random() * (LOGICAL_WIDTH - 25),
        y: 20, // Posição no topo da tela
        width: 25, height: 50, // Formato diferente
        color: '#00FFFF', // Cor Ciano
        hp: baseConfig.hp * 0.8, // Mais frágeis
        speed: 0.5, // Movimento lateral lento
        damage: baseConfig.damage * 0.5, // Dano de colisão baixo
        projectileDamage: baseConfig.projectileDamage * 1.15, // Tiros 15% mais fortes
        shootCooldown: baseConfig.shootCooldown * 1.30, // Atiram 30% mais devagar
        isSniper: true,
        maxHp: baseConfig.hp * 0.8,
        lastShotTime: 0,
    };
    room.enemies.push(sniper);
}

function spawnBoss(room) {
    const boss = {
        id: `boss_${Date.now()}`,
        x: LOGICAL_WIDTH / 2 - BOSS_CONFIG.width / 2,
        y: -BOSS_CONFIG.height,
        ...BOSS_CONFIG,
        maxHp: BOSS_CONFIG.hp,
        lastShotTime: 0,
    };
    room.enemies.push(boss);
    room.waveState = 'boss_active';
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

        // --- LÓGICA DAS HORDAS (ATUALIZADA com Snipers) ---
        if (room.gameTime > 1 && room.gameTime % 60 === 0) {
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    if (room.wave < WAVE_CONFIG.length) {
                        room.wave++;
                        room.waveState = 'active';
                        room.enemiesToSpawn = Math.floor(Math.random() * (ENEMIES_PER_WAVE[1] - ENEMIES_PER_WAVE[0] + 1)) + ENEMIES_PER_WAVE[0];
                        room.spawnCooldown = 0;
                        
                        // *** NOVO: Spawna snipers a partir da horda 2 ***
                        if (room.wave >= 2) {
                            const sniperCount = (room.wave - 1) * 2;
                            for (let i = 0; i < sniperCount; i++) {
                                spawnSniper(room, room.wave - 1);
                            }
                        }
                    } else { 
                        room.waveState = 'boss_intro';
                        room.waveTimer = 5; 
                    }
                }
            } else if (room.waveState === 'active' && room.enemies.length === 0 && room.enemiesToSpawn === 0) {
                console.log(`Sala ${roomName} limpou a horda ${room.wave}`);
                room.waveState = 'intermission';
                room.waveTimer = WAVE_INTERVAL_SECONDS;
            } else if (room.waveState === 'boss_intro') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    spawnBoss(room);
                }
            }
        }
        
        // SPAWN PERIÓDICO DE INIMIGOS TERRESTRES
        if (room.waveState === 'active' && room.enemiesToSpawn > 0) {
            room.spawnCooldown--;
            if (room.spawnCooldown <= 0) {
                spawnEnemy(room);
                room.enemiesToSpawn--;
                room.spawnCooldown = ENEMY_SPAWN_INTERVAL_TICKS;
            }
        }

        // --- ATUALIZAÇÕES DOS INIMIGOS (IA ATUALIZADA) ---
        room.enemies.forEach(enemy => {
            const targetPlayer = playerList.length > 0 ? playerList.sort((a, b) => Math.hypot(enemy.x - a.x, enemy.y - a.y) - Math.hypot(enemy.x - b.x, enemy.y - b.y))[0] : null;
            let canShoot = false;

            if (enemy.isSniper) {
                enemy.y = 20; // Mantém no topo
                if (targetPlayer) {
                    const moveDirection = Math.sign(targetPlayer.x - enemy.x);
                    if (Math.abs(targetPlayer.x - enemy.x) > enemy.speed * 5) {
                        enemy.x += moveDirection * enemy.speed;
                    }
                }
                canShoot = true; // Snipers podem atirar a qualquer momento
            } else { // Inimigos terrestres ou chefe
                const defenseY = enemy.isBoss ? (DEFENSE_LINE_Y - enemy.height / 2) : DEFENSE_LINE_Y;
                if (enemy.y < defenseY) {
                    enemy.y += enemy.speed;
                    if (enemy.y > defenseY) enemy.y = defenseY;
                } else {
                    enemy.y = defenseY;
                    canShoot = true; // Só podem atirar quando chegam na linha
                    if (targetPlayer) {
                         const moveDirection = Math.sign(targetPlayer.x - enemy.x);
                        if (moveDirection !== 0 && Math.abs(targetPlayer.x - enemy.x) > enemy.speed) {
                            const intendedX = enemy.x + moveDirection * enemy.speed;
                            if (intendedX >= 0 && intendedX <= LOGICAL_WIDTH - enemy.width) {
                                let isBlocked = false;
                                for (const other of room.enemies) {
                                    if (enemy.id === other.id || other.y < defenseY) continue;
                                    const willOverlap = (intendedX < other.x + other.width && intendedX + enemy.width > other.x);
                                    if (willOverlap) { isBlocked = true; break; }
                                }
                                if (!isBlocked) enemy.x = intendedX;
                            }
                        }
                    }
                }
            }

            // Lógica de Disparo Comum
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
                        isSniper: enemy.isSniper // Passa a informação para o cliente
                    });
                }
            }
        });
        
        // Projéteis inimigos
        room.enemyProjectiles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.y > LOGICAL_HEIGHT || p.x < 0 || p.x > LOGICAL_WIDTH) {
                room.enemyProjectiles.splice(i, 1);
            } else {
                playerList.forEach(player => {
                    if (p.x > player.x && p.x < player.x + 40 && p.y > player.y && p.y < player.y + 60) {
                        io.to(player.id).emit('playerHit', p.damage);
                        room.enemyProjectiles.splice(i, 1);
                    }
                });
            }
        });
        
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
                const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : 50); // EXP extra para Snipers
                io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id, expGain });
            }
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
