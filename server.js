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
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.use(express.static(__dirname));

// --- API para o Ranking ---
app.get('/api/ranking', async (req, res) => { /* ... (sem alterações) ... */ });
app.post('/api/ranking', async (req, res) => { /* ... (sem alterações) ... */ });

// --- Lógica do Multiplayer com Socket.IO ---
const rooms = {};
const MAX_PLAYERS_PER_ROOM = 4;
const LOGICAL_WIDTH = 1600;
const LOGICAL_HEIGHT = 900;
const GAME_TICK_RATE = 1000 / 60;
const ENEMY_SHOOT_DELAY_TICKS = 18;
const SCALE_FACTOR = 1.33;
const SCALE_DOWN_ATTR_FACTOR = 0.67;
const SCALE_UP_SIZE_FACTOR = 1.65;
const ENEMY_AND_PROJECTILE_SIZE_INCREASE = 1.3; // ATUALIZADO: Fator de 30%

const AVAILABLE_PLAYER_COLORS = ['#FFD700', '#9400D3', '#32CD32', '#FF8C00'];

const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5 * 0.75;
const BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3 * 0.75;
const RICOCHET_LINE_Y = LOGICAL_HEIGHT * 0.2 * 0.75;
const SNIPER_LINE_Y = LOGICAL_HEIGHT * 0.1 * 0.75;

// ATUALIZADO: Configs com tamanhos aumentados em 30%
const ENEMY_SIZE_MOD = SCALE_UP_SIZE_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
const WAVE_CONFIG = [
    { type: 'basic', color: '#FF4136', hp: Math.floor((72 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.04 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3600, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((90 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3360, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((120 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.2 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3000, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((168 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.28 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2640, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((210 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.36 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((30 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2400, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD }
];
const BOSS_CONFIG = {
    type: 'boss', color: '#FFFFFF', hp: Math.floor((300 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((50 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((35 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 1440, width: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, isBoss: true
};
const RICOCHET_CONFIG = {
    type: 'ricochet', color: '#FF69B4', hp: Math.floor((150 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (0.96 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.6 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, projectileDamage: Math.floor((20 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 4200, isRicochet: true, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD
};
const SNIPER_CONFIG = {
    type: 'sniper', color: '#00FFFF', speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, isSniper: true, width: (8 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (13 * SCALE_FACTOR) * ENEMY_SIZE_MOD
};
const WAVE_INTERVAL_SECONDS = 10;

// --- Funções de escalonamento ---
function getScalingFactor(wave) { /* ... (sem alterações) ... */ }
function getWaveConfig(wave) { /* ... (sem alterações) ... */ }
function getBossConfig(wave) { /* ... (sem alterações) ... */ }
function getRicochetConfig(wave) { /* ... (sem alterações) ... */ }
function findOrCreateRoom() { /* ... (sem alterações) ... */ }
function spawnEnemy(room, waveConfig) { /* ... (sem alterações) ... */ }
function spawnSniper(room, waveConfig) { /* ... (sem alterações) ... */ }
function spawnRicochet(room, wave) { /* ... (sem alterações) ... */ }
function spawnBoss(room, wave) { /* ... (sem alterações) ... */ }

function shootForEnemy(enemy, room, targetPlayer) {
    if (!targetPlayer) return;
    const now = Date.now();
    enemy.lastShotTime = now;
    // ATUALIZADO: Tamanho do jogador mantido como no original para mira
    const playerLogicalWidth = (16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;
    const playerLogicalHeight = (22 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;

    let projectile = {
        id: `ep_${now}_${Math.random()}`,
        x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2,
        damage: enemy.projectileDamage, color: enemy.color, originId: enemy.id,
        radius: (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE // ATUALIZADO
    };

    if (enemy.isRicochet) {
        const wallX = (targetPlayer.x > enemy.x) ? LOGICAL_WIDTH : 0;
        const virtualPlayerX = (wallX === 0) ? -targetPlayer.x : (2 * LOGICAL_WIDTH - targetPlayer.x);
        const angle = Math.atan2((targetPlayer.y + playerLogicalHeight/2) - projectile.y, (virtualPlayerX + playerLogicalWidth/2) - projectile.x);
        projectile.vx = Math.cos(angle) * ((14 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR);
        projectile.vy = Math.sin(angle) * ((14 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR);
        projectile.canRicochet = true; projectile.bouncesLeft = 1;
    } else {
        const angle = Math.atan2((targetPlayer.y + playerLogicalHeight/2) - projectile.y, (targetPlayer.x + playerLogicalWidth/2) - projectile.x);
        const speed = enemy.isSniper ? ((16 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR) : ((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR);
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
        if (playerList.length === 0) { delete rooms[roomName]; continue; }
        room.gameTime++;

        // LÓGICA DE HORDAS E RAIOS ... (sem alterações)
        // IA DOS INIMIGOS ... (sem alterações)

        // Projéteis inimigos
        for (let i = room.enemyProjectiles.length - 1; i >= 0; i--) {
            const p = room.enemyProjectiles[i];
            // ... (movimento e ricochete sem alterações) ...
            p.x += p.vx; p.y += p.vy;

            if (p.y > LOGICAL_HEIGHT + 50 || p.y < -50 || p.x < -50 || p.x > LOGICAL_WIDTH + 50) { room.enemyProjectiles.splice(i, 1); continue; }
            
            // ATUALIZADO: Tamanho do jogador mantido como no original para colisão
            const playerLogicalWidth = (16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;
            const playerLogicalHeight = (22 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;
            for (const player of playerList) {
                if (p.x > player.x && p.x < player.x + playerLogicalWidth && p.y > player.y && p.y < player.y + playerLogicalHeight) {
                    io.to(player.id).emit('playerHit', p.damage);
                    room.enemyProjectiles.splice(i, 1); break;
                }
            }
        }
        io.to(roomName).emit('gameState', room);
    }
}, GAME_TICK_RATE);


io.on('connection', (socket) => {
    // TODA A LÓGICA DE CONEXÃO, UPDATE, HIT, etc., permanece a mesma.
    // As novas regras de tamanho são definidas nos objetos de configuração e não alteram a lógica de eventos.
    // ... (código de conexão do socket.io sem alterações) ...
});

async function startServer() {
    try {
        await db.connect();
        server.listen(PORT, () => console.log(`Servidor rodando com sucesso na porta ${PORT}`));
    } catch (err) {
        console.error("FALHA CRÍTICA: Não foi possível conectar ao MongoDB.", err);
        process.exit(1);
    }
}

startServer();
