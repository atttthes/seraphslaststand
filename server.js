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
const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.65;
const GAME_TICK_RATE = 1000 / 60;

// --- Configurações das Hordas e Chefe ---
const WAVE_CONFIG = [
    { color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3000 }, // Horda 1 (Vermelho)
    { color: '#FF851B', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 2800 }, // Horda 2 (Laranja)
    { color: '#FFDC00', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 2500 }, // Horda 3 (Amarelo)
    { color: '#7FDBFF', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2200 }, // Horda 4 (Azul)
    { color: '#B10DC9', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2000 }  // Horda 5 (Roxo)
];
const BOSS_CONFIG = {
    color: '#FFFFFF', hp: 5000, speed: 0.8, damage: 50, projectileDamage: 35, shootCooldown: 1000, width: 120, height: 120
};
const WAVE_INTERVAL_SECONDS = 20;
const ENEMIES_PER_WAVE = [12, 18]; // Min, Max

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
        waveState: 'intermission', // intermission, spawning, active, boss_intro, boss_active
        waveTimer: 5, // Inicia mais rápido a primeira horda
        enemiesToSpawn: 0,
    };
    console.log(`Nova sala criada: ${newRoomName}`);
    return newRoomName;
}

function spawnEnemy(room) {
    const waveIndex = room.wave - 1;
    const config = WAVE_CONFIG[waveIndex];
    const enemy = {
        id: `enemy_${Date.now()}_${Math.random()}`,
        x: Math.random() * LOGICAL_WIDTH,
        y: -50,
        width: 40, height: 40,
        ...config,
        maxHp: config.hp,
        lastShotTime: 0,
        targetX: Math.random() * LOGICAL_WIDTH // Posição horizontal alvo na linha de defesa
    };
    room.enemies.push(enemy);
}

function spawnBoss(room) {
    const boss = {
        id: `boss_${Date.now()}`,
        x: LOGICAL_WIDTH / 2 - BOSS_CONFIG.width / 2,
        y: -BOSS_CONFIG.height,
        ...BOSS_CONFIG,
        maxHp: BOSS_CONFIG.hp,
        lastShotTime: 0,
        targetX: LOGICAL_WIDTH / 2
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

        // --- LÓGICA DAS HORDAS ---
        if (room.gameTime > 1 && room.gameTime % 60 === 0) { // Checa a cada segundo
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    if (room.wave < WAVE_CONFIG.length) {
                        room.wave++;
                        room.waveState = 'spawning';
                        room.enemiesToSpawn = Math.floor(Math.random() * (ENEMIES_PER_WAVE[1] - ENEMIES_PER_WAVE[0] + 1)) + ENEMIES_PER_WAVE[0];
                    } else { // Acabaram as hordas, prepara o chefe
                        room.waveState = 'boss_intro';
                        room.waveTimer = 5; // Tempo de espera para o chefe
                    }
                }
            } else if (room.waveState === 'active' && room.enemies.length === 0) {
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

        if (room.waveState === 'spawning' && room.enemiesToSpawn > 0 && room.gameTime % 30 === 0) { // Spawna 1 a cada 0.5s
            spawnEnemy(room);
            room.enemiesToSpawn--;
            if (room.enemiesToSpawn === 0) {
                room.waveState = 'active';
            }
        }

        // --- ATUALIZAÇÕES ---
        // Inimigos
        room.enemies.forEach(enemy => {
            let targetPlayer = playerList.sort((a, b) => Math.hypot(enemy.x - a.x, enemy.y - a.y) - Math.hypot(enemy.x - b.x, enemy.y - b.y))[0];
            if (targetPlayer) {
                enemy.targetX = targetPlayer.x;
            }

            const defenseY = DEFENSE_LINE_Y - (enemy.isBoss ? enemy.height : 0);
            if (enemy.y < defenseY) {
                const angle = Math.atan2(defenseY - enemy.y, enemy.targetX - enemy.x);
                enemy.x += Math.cos(angle) * enemy.speed;
                enemy.y += Math.sin(angle) * enemy.speed;
            } else {
                enemy.y = defenseY;
                const moveDirection = Math.sign(enemy.targetX - enemy.x);
                const intendedX = enemy.x + moveDirection * enemy.speed;
                
                // Prevenção de sobreposição simples
                let canMove = true;
                for (const other of room.enemies) {
                    if (enemy.id !== other.id && Math.abs(intendedX - other.x) < (enemy.width / 2 + other.width / 2)) {
                        canMove = false;
                        break;
                    }
                }
                if (canMove && intendedX > 0 && intendedX < LOGICAL_WIDTH - enemy.width) {
                    enemy.x = intendedX;
                }

                // Disparar
                const now = Date.now();
                if (now > (enemy.lastShotTime || 0) + enemy.shootCooldown && targetPlayer) {
                    enemy.lastShotTime = now;
                    const angle = Math.atan2(targetPlayer.y - enemy.y, targetPlayer.x - enemy.x);
                    room.enemyProjectiles.push({
                        id: `ep_${now}_${Math.random()}`,
                        x: enemy.x + enemy.width / 2,
                        y: enemy.y + enemy.height,
                        vx: Math.cos(angle) * 7,
                        vy: Math.sin(angle) * 7,
                        damage: enemy.projectileDamage,
                        color: enemy.color
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
                // Colisão projétil -> jogador
                playerList.forEach(player => {
                    if (p.x > player.x && p.x < player.x + 40 && p.y > player.y && p.y < player.y + 60) {
                        // A colisão real será tratada no cliente para resposta imediata, mas o dano é confirmado aqui
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
        room.players[socket.id] = {
            id: socket.id,
            ...playerData
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
                const expGain = enemy.isBoss ? 1000 : 50;
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
