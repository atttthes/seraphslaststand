// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// --- Configuração do Express ---
// ATENÇÃO: A pasta 'public' não existe nos arquivos fornecidos, então servi os arquivos da raiz.
// Se você criar uma pasta 'public' e mover index.html, style.css e game.js para dentro, descomente a linha abaixo.
// app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname)); // Servindo da raiz
app.use(express.json());

app.get('/', (req, res) => {
    // Se usar a pasta 'public', mude para path.join(__dirname, 'public', 'index.html')
    res.sendFile(path.join(__dirname, 'index.html'));
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
const CANVAS_WIDTH = 1600; // Largura do mapa atualizada

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

// Game loop do servidor: A fonte da verdade para o estado do jogo compartilhado.
setInterval(() => {
    // Itera sobre todas as salas ativas
    for (const roomName in rooms) {
        const room = rooms[roomName];
        
        // Só roda a lógica se houver jogadores na sala
        if (Object.keys(room.players).length > 0) {
            room.gameTime++;

            // Lógica de spawn de inimigos (exemplo para esta sala)
            if (room.gameTime % 5 === 0) {
                const enemy = {
                    id: `enemy_${Date.now()}_${Math.random()}`,
                    x: Math.random() < 0.5 ? -50 : CANVAS_WIDTH + 50, // Nasce fora da tela
                    y: Math.random() * 600, // Altura do canvas - um pouco
                    hp: 100 + (room.gameTime * 0.5),
                    speed: 1.25,
                    damage: 12.5
                };
                room.enemies.push(enemy);
            }
            
            // Atualiza posição dos inimigos
            room.enemies.forEach(enemy => {
                // Lógica de movimento simples (pode ser aprimorada para seguir o jogador mais próximo)
                // Aqui, vamos apenas movê-los para o centro para simplificar
                const targetX = CANVAS_WIDTH / 2;
                const angle = Math.atan2(400 - enemy.y, targetX - enemy.x);
                enemy.x += Math.cos(angle) * enemy.speed;
                enemy.y += Math.sin(angle) * enemy.speed;
            });

            // Enviar o estado atualizado para todos os jogadores na sala específica
            io.to(roomName).emit('gameState', room);

        } else {
            // Se a sala está vazia, deleta para economizar recursos
            console.log(`Deletando sala vazia: ${roomName}`);
            delete rooms[roomName];
        }
    }
}, 1000/60); // Loop mais rápido para movimento suave do inimigo


io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('joinMultiplayer', (playerData) => {
        const roomName = findOrCreateRoom();
        socket.join(roomName);
        socket.room = roomName; // Armazena a sala no objeto do socket

        const room = rooms[roomName];
        room.players[socket.id] = {
            id: socket.id,
            ...playerData
        };
        console.log(`Jogador ${playerData.name || 'Anônimo'} (${socket.id}) entrou na sala ${roomName}.`);
        // Não emite mais 'playerJoined', pois 'gameState' já envia tudo
    });

    socket.on('playerUpdate', (data) => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id] = { ...room.players[socket.id], ...data };
        }
    });

    socket.on('playerShoot', (bulletData) => {
        // Retransmite o evento de tiro para os outros jogadores na mesma sala
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
                // Notifica todos os clientes na sala que o inimigo morreu
                io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        const roomName = socket.room;
        if (roomName && rooms[roomName]) {
            // Remove o jogador do estado do jogo na sala
            delete rooms[roomName].players[socket.id];
            // Notifica outros jogadores na sala que este jogador saiu
            io.to(roomName).emit('playerLeft', socket.id);

            // Se a sala ficar vazia, o loop principal a removerá.
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
