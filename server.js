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

// Conectar ao banco de dados
db.connect().catch(err => console.error("Falha ao conectar ao MongoDB:", err));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Para parsing de JSON no corpo das requisições

// Rota principal para o jogo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API para o Ranking ---
app.get('/api/ranking', async (req, res) => {
    try {
        const scores = await db.getTopScores(10); // Pega os 10 melhores
        res.json(scores);
    } catch (error) {
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
        res.status(500).json({ message: "Erro ao salvar pontuação", error });
    }
});


// --- Lógica do Multiplayer com Socket.IO ---
const multiplayerState = {
    players: {},
    enemies: [],
    gameTime: 0
};

// Lógica de jogo do servidor (simplificada)
// O servidor será a fonte da verdade para os inimigos e o tempo de jogo
// Isso evita que um cliente trapaceie ou que haja dessincronização
setInterval(() => {
    if (Object.keys(multiplayerState.players).length > 0) {
        multiplayerState.gameTime++;

        // Lógica de spawn de inimigos (exemplo)
        if (multiplayerState.gameTime % 5 === 0) {
            const enemy = {
                id: `enemy_${Date.now()}_${Math.random()}`,
                x: Math.random() * 800, // Largura do canvas
                y: 0,
                hp: 100 + (multiplayerState.gameTime * 0.5),
                speed: 1.25, // +25% velocidade
                damage: 12.5  // +25% dano
            };
            multiplayerState.enemies.push(enemy);
        }

        // Enviar o estado atualizado para todos os jogadores na sala 'multiplayer'
        io.to('multiplayer').emit('gameState', {
            players: multiplayerState.players,
            enemies: multiplayerState.enemies,
            gameTime: multiplayerState.gameTime
        });
    } else {
        // Reseta o jogo se não houver jogadores
        multiplayerState.enemies = [];
        multiplayerState.gameTime = 0;
    }
}, 1000); // Atualiza o tempo e spawna inimigos a cada segundo


io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('joinMultiplayer', (playerData) => {
        socket.join('multiplayer');
        multiplayerState.players[socket.id] = {
            id: socket.id,
            ...playerData
        };
        console.log(`Jogador ${playerData.name} (${socket.id}) entrou no modo multiplayer.`);
    });

    socket.on('playerUpdate', (data) => {
        if (multiplayerState.players[socket.id]) {
            multiplayerState.players[socket.id] = { ...multiplayerState.players[socket.id], ...data };
        }
    });

    socket.on('playerShoot', (bulletData) => {
        // Retransmite o tiro para outros jogadores
        socket.to('multiplayer').emit('playerShot', bulletData);
    });
    
    socket.on('enemyHit', ({ enemyId, damage }) => {
        const enemy = multiplayerState.enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp -= damage;
            if (enemy.hp <= 0) {
                multiplayerState.enemies = multiplayerState.enemies.filter(e => e.id !== enemyId);
                // Notificar clientes que o inimigo morreu e quem ganhou EXP
                io.to('multiplayer').emit('enemyDied', { enemyId, killerId: socket.id });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        delete multiplayerState.players[socket.id];
        io.to('multiplayer').emit('playerLeft', socket.id);
    });
});


server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
