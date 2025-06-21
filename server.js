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
app.get('/api/ranking', async (req, res) => { /* ... (código inalterado) ... */ });
app.post('/api/ranking', async (req, res) => { /* ... (código inalterado) ... */ });

// --- Lógica do Multiplayer com Socket.IO ---
const rooms = {};
const MAX_PLAYERS_PER_ROOM = 4;
const LOGICAL_WIDTH = 900;
const LOGICAL_HEIGHT = 1600;
const GAME_TICK_RATE = 1000 / 60; // 60 updates per second

const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5, BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3, RICOCHET_LINE_Y = 180, SNIPER_LINE_Y = 80;

// --- Configurações das Hordas e Inimigos ---
const WAVE_CONFIG = [
    { class: 'normal', color: '#FF4136', hp: 120, speed: 1.3, damage: 15, projectileDamage: 10, shootCooldown: 3600 },
    { class: 'normal', color: '#FF4136', hp: 150, speed: 1.4, damage: 18, projectileDamage: 12, shootCooldown: 3360 },
    { class: 'normal', color: '#FF4136', hp: 200, speed: 1.5, damage: 22, projectileDamage: 15, shootCooldown: 3000 },
    { class: 'normal', color: '#FF4136', hp: 280, speed: 1.6, damage: 25, projectileDamage: 18, shootCooldown: 2640 },
    { class: 'normal', color: '#FF4136', hp: 350, speed: 1.7, damage: 30, projectileDamage: 22, shootCooldown: 2400 }
];
const BOSS_CONFIG = { class: 'boss', color: '#FFFFFF', hp: 500, speed: 0.8, damage: 50, projectileDamage: 35, shootCooldown: 1440, width: 120, height: 120, isBoss: true };
const RICOCHET_CONFIG = { class: 'ricochet', color: '#FF69B4', hp: 250, speed: 1.2, horizontalSpeed: 0.6, projectileDamage: 20, shootCooldown: 4200, isRicochet: true, width: 35, height: 35 };
const WAVE_INTERVAL_SECONDS = 10;
const SNIPER_BASE_CONFIG = { class: 'sniper', color: '#00FFFF', hpMultiplier: 0.8, damageMultiplier: 0.5, projectileDamageMultiplier: 1.15, shootCooldownMultiplier: 1.3, width: 25, height: 50, isSniper: true, speed: 1.0, horizontalSpeed: 0.5 };

// --- Função para escalar dificuldade ---
function getScalingFactor(wave) { /* ... (código inalterado) ... */ }
function getWaveConfig(wave) { /* ... (código inalterado) ... */ }
function getBossConfig(wave) { /* ... (código inalterado) ... */ }
function getRicochetConfig(wave) { /* ... (código inalterado) ... */ }

function findOrCreateRoom() {
    for (const roomName in rooms) {
        if (Object.keys(rooms[roomName].players).length < MAX_PLAYERS_PER_ROOM) {
            return roomName;
        }
    }
    const newRoomName = `room_${Date.now()}`;
    rooms[newRoomName] = {
        players: {}, enemies: [], enemyProjectiles: [],
        lightningStrikes: [], activeBlades: [],
        gameTime: 0, wave: 0, waveState: 'intermission', waveTimer: 5,
        lastShotTimeByClass: {}, // Para IA de tiro
    };
    console.log(`Nova sala criada: ${newRoomName}`);
    return newRoomName;
}

function spawnEnemy(room, waveConfig) { room.enemies.push({ id: `enemy_${Date.now()}_${Math.random()}`, x: Math.random() * (LOGICAL_WIDTH - 40), y: -50, width: 40, height: 40, ...waveConfig, maxHp: waveConfig.hp, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, horizontalSpeed: waveConfig.speed / 2 }); }
function spawnSniper(room, waveConfig) { const config = getWaveConfig(room.wave); room.enemies.push({ id: `sniper_${Date.now()}_${Math.random()}`, x: Math.random() * (LOGICAL_WIDTH - SNIPER_BASE_CONFIG.width), y: -50, ...SNIPER_BASE_CONFIG, hp: config.hp * SNIPER_BASE_CONFIG.hpMultiplier, maxHp: config.hp * SNIPER_BASE_CONFIG.hpMultiplier, damage: config.damage * SNIPER_BASE_CONFIG.damageMultiplier, projectileDamage: config.projectileDamage * SNIPER_BASE_CONFIG.projectileDamageMultiplier, shootCooldown: config.shootCooldown * SNIPER_BASE_CONFIG.shootCooldownMultiplier, lastShotTime: 0, patrolOriginX: null, reachedPosition: false }); }
function spawnRicochet(room, wave) { const ricochetConfig = getRicochetConfig(wave); room.enemies.push({ id: `ricochet_${Date.now()}_${Math.random()}`, x: Math.random() * (LOGICAL_WIDTH - ricochetConfig.width), y: -50, ...ricochetConfig, maxHp: ricochetConfig.hp, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, }); }
function spawnBoss(room, wave) { const bossConfig = getBossConfig(wave); room.enemies.push({ id: `boss_${Date.now()}_${Math.random()}`, x: LOGICAL_WIDTH / 2 - bossConfig.width / 2, y: -bossConfig.height, ...bossConfig, horizontalSpeed: bossConfig.speed, speed: 1.2, maxHp: bossConfig.hp, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, }); }

// Game loop do servidor
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        const playerList = Object.values(room.players);

        if (playerList.length === 0) { console.log(`Deletando sala vazia: ${roomName}`); delete rooms[roomName]; continue; }

        room.gameTime++;
        
        // Atualizar estado dos jogadores (recargas)
        playerList.forEach(p => {
            if (p.hasTotalReaction && !p.totalReactionReady && room.wave >= p.totalReactionCooldownEndWave) {
                p.totalReactionReady = true;
            }
        });
        
        // Atualizar lâminas ativas
        for (let i = room.activeBlades.length - 1; i >= 0; i--) {
            const blade = room.activeBlades[i];
            blade.life--;
            if (blade.life <= 0) { room.activeBlades.splice(i, 1); continue; }
            
            const owner = room.players[blade.ownerId];
            if (owner) {
                blade.y -= blade.speed;
                const progress = (owner.y - blade.y) / owner.y;
                blade.width = Math.min(blade.maxWidth, blade.baseWidth + progress * blade.maxWidth);
            }
        }

        // LÓGICA DE HORDAS
        if (room.gameTime > 1 && room.gameTime % 60 === 0) {
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    room.wave++; room.waveState = 'active';
                    const waveConfig = getWaveConfig(room.wave);
                    const normalEnemyCount = room.wave + 1; for (let i = 0; i < normalEnemyCount; i++) { setTimeout(() => { if (rooms[roomName]) spawnEnemy(room, waveConfig); }, i * 250); }
                    if (room.wave >= 3) { const sniperCount = 1 + (room.wave - 3) * 2; for (let i = 0; i < sniperCount; i++) spawnSniper(room, waveConfig); }
                    if (room.wave >= 7 && (room.wave - 7) % 2 === 0) { const ricochetCount = Math.floor((room.wave - 7) / 2) + 1; for (let i = 0; i < ricochetCount; i++) spawnRicochet(room, room.wave); }
                    if (room.wave >= 10 && (room.wave - 10) % 3 === 0) { const bossCount = Math.floor((room.wave - 10) / 3) + 1; for (let i = 0; i < bossCount; i++) spawnBoss(room, room.wave); }
                }
            } else if (room.waveState === 'active' && room.enemies.length === 0) {
                console.log(`Sala ${roomName} limpou a horda ${room.wave}`); room.waveState = 'intermission'; room.waveTimer = WAVE_INTERVAL_SECONDS;
            }
        }
        
        // --- LÓGICA DO RAIO ---
        /* ... (código inalterado) ... */

        // IA DOS INIMIGOS
        room.enemies.forEach(enemy => {
            const targetPlayer = playerList.length > 0 ? playerList[room.gameTime % playerList.length] : null;
            if (!targetPlayer) return;

            // Movimento do inimigo
            let targetY;
            if (enemy.isSniper) targetY = SNIPER_LINE_Y; else if (enemy.isRicochet) targetY = RICOCHET_LINE_Y; else if (enemy.isBoss) targetY = BOSS_LINE_Y; else targetY = DEFENSE_LINE_Y;
            if (!enemy.reachedPosition) { if (enemy.y < targetY) { enemy.y += enemy.speed; } else { enemy.y = targetY; enemy.reachedPosition = true; enemy.patrolOriginX = enemy.x; } }
            else { /* ... (movimento de patrulha inalterado) ... */ }
            if (enemy.x < 0) enemy.x = 0; if (enemy.x > LOGICAL_WIDTH - enemy.width) enemy.x = LOGICAL_WIDTH - enemy.width;
            
            // Lógica de Tiro Coordenado
            const now = Date.now();
            const enemyClass = enemy.class || 'normal';
            const canShoot = now > (enemy.lastShotTime || 0) + enemy.shootCooldown;
            const classCooldown = now > (room.lastShotTimeByClass[enemyClass] || 0) + 300; // 0.3s

            if (enemy.reachedPosition && canShoot && classCooldown) {
                room.lastShotTimeByClass[enemyClass] = now;
                enemy.lastShotTime = now;
                
                const projProps = { id: `ep_${now}_${Math.random()}`, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2, damage: enemy.projectileDamage, color: enemy.color, shooterId: enemy.id };
                if (enemy.isRicochet) {
                    const wallX = (targetPlayer.x > enemy.x) ? LOGICAL_WIDTH : 0; const virtualPlayerX = (wallX === 0) ? -targetPlayer.x : (2 * LOGICAL_WIDTH - targetPlayer.x);
                    const angle = Math.atan2((targetPlayer.y + 30) - (enemy.y + enemy.height / 2), (virtualPlayerX + 20) - (enemy.x + enemy.width / 2));
                    room.enemyProjectiles.push({ ...projProps, vx: Math.cos(angle) * 8, vy: Math.sin(angle) * 8, canRicochet: true, bouncesLeft: 1 });
                } else {
                    const angle = Math.atan2((targetPlayer.y + 30) - (enemy.y + enemy.height / 2), (targetPlayer.x + 20) - (enemy.x + enemy.width / 2));
                    room.enemyProjectiles.push({ ...projProps, vx: Math.cos(angle) * 7, vy: Math.sin(angle) * 7 });
                }
            }
        });

        // Projéteis inimigos
        for (let i = room.enemyProjectiles.length - 1; i >= 0; i--) {
            const p = room.enemyProjectiles[i];
            
            // Colisão com Lâmina de Reação
            let reflected = false;
            for(const blade of room.activeBlades) {
                const owner = room.players[blade.ownerId];
                if(owner && p.x > owner.x - blade.width / 2 && p.x < owner.x + blade.width / 2 && p.y > blade.y && p.y < blade.y + 15) {
                    const originalShooter = room.enemies.find(e => e.id === p.shooterId);
                    if (originalShooter) {
                        const angle = Math.atan2((originalShooter.y + originalShooter.height / 2) - p.y, (originalShooter.x + originalShooter.width / 2) - p.x);
                        // Emitir um tiro de jogador em vez de criar um novo tipo de projétil
                        io.to(roomName).emit('playerShot', {
                            x: p.x / LOGICAL_WIDTH, y: p.y / LOGICAL_HEIGHT,
                            angle: angle, speed: 12, damage: p.damage * 3
                        });
                    }
                    room.enemyProjectiles.splice(i, 1);
                    reflected = true;
                    break;
                }
            }
            if(reflected) continue;

            if (p.canRicochet && p.bouncesLeft > 0) { if (p.x <= 0 || p.x >= LOGICAL_WIDTH) { p.vx *= -1; p.bouncesLeft--; p.x = p.x <= 0 ? 1 : LOGICAL_WIDTH - 1; } }
            
            p.x += p.vx; p.y += p.vy;

            if (p.y > LOGICAL_HEIGHT + 50 || p.y < -50 || p.x < -50 || p.x > LOGICAL_WIDTH + 50) { room.enemyProjectiles.splice(i, 1); continue; }
            for (const player of playerList) { /* ... (colisão com jogador inalterada) ... */ }
        }

        io.to(roomName).emit('gameState', room);
    }
}, GAME_TICK_RATE);


io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('joinMultiplayer', (playerData) => {
        const roomName = findOrCreateRoom(); socket.join(roomName); socket.room = roomName;
        const room = rooms[roomName];
        room.players[socket.id] = { id: socket.id, ...playerData, hasAlly: false, allyCooldownWave: 0, hasLightning: false, hasTotalReaction: false, totalReactionReady: false, totalReactionCooldownEndWave: 0 };
        console.log(`Jogador ${playerData.name || 'Anônimo'} (${socket.id}) entrou na sala ${roomName}.`);
        socket.emit('roomJoined', { logicalWidth: LOGICAL_WIDTH, logicalHeight: LOGICAL_HEIGHT });
    });

    socket.on('playerUpdate', (data) => { /* ... (código inalterado) ... */ });
    socket.on('playerShoot', (bulletData) => { /* ... (código inalterado) ... */ });
    socket.on('enemyHit', ({ enemyId, damage }) => { /* ... (código inalterado) ... */ });
    socket.on('enemyProjectileDestroyed', (projectileId) => { /* ... (código inalterado) ... */ });
    socket.on('playerGotAlly', () => { /* ... (código inalterado) ... */ });
    socket.on('playerLostAlly', () => { /* ... (código inalterado) ... */ });
    socket.on('playerGotLightning', () => { /* ... (código inalterado) ... */ });
    
    socket.on('playerGotTotalReaction', () => {
        const room = rooms[socket.room];
        if (room && room.players[socket.id]) {
            room.players[socket.id].hasTotalReaction = true;
            room.players[socket.id].totalReactionReady = true;
        }
    });

    socket.on('useTotalReaction', () => {
        const room = rooms[socket.room];
        const player = room?.players[socket.id];
        if (player && player.totalReactionReady) {
            player.totalReactionReady = false;
            player.totalReactionCooldownEndWave = room.wave + 4;
            
            const ownerPos = room.players[socket.id];
            room.activeBlades.push({
                ownerId: socket.id,
                y: ownerPos.y + 60,
                width: 40,
                baseWidth: 40,
                maxWidth: LOGICAL_WIDTH * 1.5,
                speed: 12,
                life: 120 // 2 segundos
            });
        }
    });

    socket.on('disconnect', () => { /* ... (código inalterado) ... */ });
});


// --- Inicialização do Servidor ---
async function startServer() { /* ... (código inalterado) ... */ }

startServer();
