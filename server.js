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
// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));
// Habilitar o parsing de JSON no corpo das requisições
app.use(express.json());

// Rota principal para servir o jogo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API para o Ranking ---
app.get('/api/ranking', async (req, res) => {
    try {
        // Pega os 10 melhores scores
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
const multiplayerState = {
    players: {},
    enemies: [],
    gameTime: 0
};

// Game loop do servidor: A fonte da verdade para o estado do jogo compartilhado.
// Isso evita que um cliente trapaceie ou que haja dessincronização.
setInterval(() => {
    // Só roda a lógica se houver jogadores online
    if (Object.keys(multiplayerState.players).length > 0) {
        multiplayerState.gameTime++;

        // Lógica de spawn de inimigos (exemplo)
        if (multiplayerState.gameTime % 5 === 0) {
            const enemy = {
                id: `enemy_${Date.now()}_${Math.random()}`,
                x: Math.random() * 800, // Largura do canvas (ajuste se necessário)
                y: 0,
                hp: 100 + (multiplayerState.gameTime * 0.5),
                speed: 1.25,
                damage: 12.5
            };
            multiplayerState.enemies.push(enemy);
        }

        // Enviar o estado atualizado para todos os jogadores na sala 'multiplayer'
        io.to('multiplayer').emit('gameState', multiplayerState);
    } else {
        // Reseta o jogo se não houver jogadores para economizar recursos
        multiplayerState.enemies = [];
        multiplayerState.gameTime = 0;
    }
}, 1000); // Atualiza o estado a cada segundo


io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('joinMultiplayer', (playerData) => {
        // Adiciona o jogador a uma "sala" para facilitar o envio de mensagens
        socket.join('multiplayer');
        
        multiplayerState.players[socket.id] = {
            id: socket.id,
            ...playerData
        };
        console.log(`Jogador ${playerData.name || 'Anônimo'} (${socket.id}) entrou no modo multiplayer.`);
    });

    socket.on('playerUpdate', (data) => {
        // Atualiza os dados do jogador no estado do servidor
        if (multiplayerState.players[socket.id]) {
            multiplayerState.players[socket.id] = { ...multiplayerState.players[socket.id], ...data };
        }
    });

    socket.on('playerShoot', (bulletData) => {
        // Retransmite o evento de tiro para os outros jogadores na mesma sala
        socket.to('multiplayer').emit('playerShot', bulletData);
    });
    
    socket.on('enemyHit', ({ enemyId, damage }) => {
        const enemy = multiplayerState.enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp -= damage;
            if (enemy.hp <= 0) {
                multiplayerState.enemies = multiplayerState.enemies.filter(e => e.id !== enemyId);
                // Notifica todos os clientes que o inimigo morreu para que possam removê-lo e dar EXP
                io.to('multiplayer').emit('enemyDied', { enemyId, killerId: socket.id });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        // Remove o jogador do estado do jogo
        delete multiplayerState.players[socket.id];
        // Notifica outros jogadores que este jogador saiu
        io.to('multiplayer').emit('playerLeft', socket.id);
    });
});


// --- Inicialização do Servidor ---
// Função assíncrona para garantir a conexão com o DB antes de iniciar o servidor
async function startServer() {
    try {
        // 1. Tenta conectar ao banco de dados
        await db.connect();
        
        // 2. Se a conexão for bem-sucedida, inicia o servidor
        server.listen(PORT, () => {
            console.log(`Servidor rodando com sucesso na porta ${PORT}`);
        });
    } catch (err) {
        // 3. Se a conexão falhar, exibe um erro crítico e encerra a aplicação
        console.error("FALHA CRÍTICA: Não foi possível conectar ao MongoDB. O servidor não irá iniciar.", err);
        process.exit(1); // Encerra o processo com um código de erro
    }
}

// Chama a função para iniciar todo o processo
startServer();
