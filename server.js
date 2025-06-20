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
// ATUALIZADO: Dimensões lógicas do mapa em modo retrato (vertical)
const LOGICAL_WIDTH = 900;
const LOGICAL_HEIGHT = 1600;
const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.65; // Linha onde os inimigos param

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
        gameTime: 0
    };
    console.log(`Nova sala criada: ${newRoomName}`);
    return newRoomName;
}

// Game loop do servidor: A fonte da verdade
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        const playerList = Object.values(room.players);

        if (playerList.length > 0) {
            room.gameTime++;

            // Lógica de spawn de inimigos
            if (room.gameTime > 1 && room.gameTime % 4 === 0) {
                const enemy = {
                    id: `enemy_${Date.now()}_${Math.random()}`,
                    x: Math.random() * LOGICAL_WIDTH,
                    y: -50, // Nasce no topo, fora da tela
                    hp: 100 + (room.gameTime * 0.75),
                    speed: 1.25 + (room.gameTime * 0.005),
                    damage: 15
                };
                room.enemies.push(enemy);
            }
            
            // Atualiza posição dos inimigos (NOVA LÓGICA)
            room.enemies.forEach(enemy => {
                let targetX = LOGICAL_WIDTH / 2; // Padrão se não houver jogador
                
                // Encontra o jogador mais próximo para mirar
                let closestPlayer = null;
                let minDistance = Infinity;
                playerList.forEach(player => {
                    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPlayer = player;
                    }
                });

                if (closestPlayer) {
                    targetX = closestPlayer.x;
                }

                // Inimigos param na linha de defesa
                if (enemy.y >= DEFENSE_LINE_Y) {
                    // Já está na linha, apenas se move horizontalmente
                    const angle = Math.atan2(0, targetX - enemy.x); // Angulo 0 para Y
                    enemy.x += Math.cos(angle) * enemy.speed;
                } else {
                    // Move-se em direção ao alvo
                    const angle = Math.atan2(DEFENSE_LINE_Y - enemy.y, targetX - enemy.x);
                    enemy.x += Math.cos(angle) * enemy.speed;
                    enemy.y += Math.sin(angle) * enemy.speed;
                }
            });

            // Envia o estado para todos na sala
            io.to(roomName).emit('gameState', room);

        } else {
            console.log(`Deletando sala vazia: ${roomName}`);
            delete rooms[roomName];
        }
    }
}, 1000/60);


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
    });

    socket.on('playerUpdate', (data) => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id] = { ...room.players[socket.id], ...data };
        }
    });

    socket.on('playerShoot', (bulletData) => {
        socket.to(socket.room).emit('playerShot', bulletData);
    });
    
    socket.on('enemyHit', ({ enemyId, damage }) => {
        const room = rooms[socket.room];
        if (!room) return;

        const enemy = room.enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp -= damage;
            if (enemy.hp <= 0) {
                room.enemies = room.enemies.filter(e => e.id !== enemyId);
                io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id });
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
