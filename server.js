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
app.get('/api/ranking', async (req, res) => {
    try {
        const scores = await db.getTopScores(10);
        res.json(scores);
    } catch (err) {
        console.error("Erro ao buscar ranking:", err);
        res.status(500).json({ error: "Erro ao buscar ranking" });
    }
});

app.post('/api/ranking', async (req, res) => {
    try {
        const { name, timeSurvived } = req.body;
        if (!name || typeof timeSurvived !== 'number') {
            return res.status(400).json({ error: "Dados inválidos." });
        }
        await db.addScore(name, timeSurvived);
        res.status(201).json({ message: "Pontuação adicionada com sucesso!" });
    } catch (err) {
        console.error("Erro ao adicionar pontuação:", err);
        res.status(500).json({ error: "Erro ao adicionar pontuação" });
    }
});


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
const ENEMY_AND_PROJECTILE_SIZE_INCREASE = 1.3;

const AVAILABLE_PLAYER_COLORS = ['#FFD700', '#9400D3', '#32CD32', '#FF8C00'];

const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5 * 0.75;
const BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3 * 0.75;
const RICOCHET_LINE_Y = LOGICAL_HEIGHT * 0.2 * 0.75;
const SNIPER_LINE_Y = LOGICAL_HEIGHT * 0.1 * 0.75;

// Configs com tamanhos aumentados
const ENEMY_SIZE_MOD = SCALE_UP_SIZE_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
const WAVE_CONFIG = [
    { type: 'basic', color: '#FF4136', hp: Math.floor((72 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.04 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3600, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((90 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3360, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((120 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.2 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3000, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((168 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.28 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2640, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((210 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.36 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((30 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2400, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD }
];
// ATUALIZAÇÃO: Vida do boss aumentada
const BOSS_CONFIG = {
    type: 'boss', color: '#FFFFFF', hp: Math.floor((300 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR) + 80, speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((50 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((35 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 1440, width: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, isBoss: true
};
const RICOCHET_CONFIG = {
    type: 'ricochet', color: '#FF69B4', hp: Math.floor((150 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (0.96 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.6 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, projectileDamage: Math.floor((20 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 4200, isRicochet: true, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD
};
const SNIPER_CONFIG = {
    type: 'sniper', color: '#00FFFF', speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, isSniper: true, width: (8 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (13 * SCALE_FACTOR) * ENEMY_SIZE_MOD
};
const WAVE_INTERVAL_SECONDS = 10;

// --- Funções de escalonamento e spawn ---
function getScalingFactor(wave) { if (wave <= 1) return 1.0; return 1.0 + Math.min(0.40, (wave - 1) * 0.05); }
function getWaveConfig(wave) { const base = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1]; const scale = getScalingFactor(wave); return { ...base, hp: Math.floor(base.hp * scale), damage: Math.floor(base.damage * scale), projectileDamage: Math.floor(base.projectileDamage * scale) }; }
function getBossConfig(wave) { const scale = getScalingFactor(wave); return { ...BOSS_CONFIG, hp: Math.floor(BOSS_CONFIG.hp * scale), damage: Math.floor(BOSS_CONFIG.damage * scale), projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scale) }; }
function getRicochetConfig(wave) { const scale = getScalingFactor(wave); return { ...RICOCHET_CONFIG, hp: Math.floor(RICOCHET_CONFIG.hp * scale), projectileDamage: Math.floor(RICOCHET_CONFIG.projectileDamage * scale) }; }
function findOrCreateRoom() {
    for (const name in rooms) { if (Object.keys(rooms[name].players).length < MAX_PLAYERS_PER_ROOM) return name; }
    const newName = `room_${Date.now()}`;
    // ATUALIZAÇÃO: Adicionado 'playerProjectiles' para gerenciar disparos dos jogadores
    rooms[newName] = { players: {}, enemies: [], enemyProjectiles: [], playerProjectiles: [], lightningStrikes: [], gameTime: 0, wave: 0, waveState: 'intermission', waveTimer: 5, classShootingCooldowns: {}, bladeHits: {}, availableColors: [...AVAILABLE_PLAYER_COLORS], totalReactionHolderId: null };
    return newName;
}
function spawnEnemy(room, config) { room.enemies.push({ id: `enemy_${Date.now()}_${Math.random()}`, x: Math.random()*(LOGICAL_WIDTH-config.width), y: -50, ...config, maxHp: config.hp, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, baseY: 0, horizontalSpeed: config.speed / 2 }); }
function spawnSniper(room, config) { const sniper = { id: `sniper_${Date.now()}_${Math.random()}`, x: Math.random() * (LOGICAL_WIDTH - SNIPER_CONFIG.width), y: -50, ...SNIPER_CONFIG, hp: config.hp * 0.8, maxHp: config.hp * 0.8, damage: config.damage * 0.5, projectileDamage: config.projectileDamage * 1.15, shootCooldown: config.shootCooldown * 1.3 * 1.2, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, baseY: 0 }; room.enemies.push(sniper); }
function spawnRicochet(room, wave) { const config = getRicochetConfig(wave); room.enemies.push({ id: `ricochet_${Date.now()}_${Math.random()}`, x: Math.random() * (LOGICAL_WIDTH - config.width), y: -50, ...config, maxHp: config.hp, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, baseY: 0 }); }
function spawnBoss(room, wave) { const config = getBossConfig(wave); room.enemies.push({ id: `boss_${Date.now()}_${Math.random()}`, x: LOGICAL_WIDTH / 2 - config.width / 2, y: -config.height, ...config, maxHp: config.hp, lastShotTime: 0, patrolOriginX: null, reachedPosition: false, baseY: 0 }); }

function shootForEnemy(enemy, room, targetPlayer) {
    if (!targetPlayer) return;
    const now = Date.now();
    enemy.lastShotTime = now;
    const playerLogicalWidth = (16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;
    const playerLogicalHeight = (22 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;

    let projectile = {
        id: `ep_${now}_${Math.random()}`, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2,
        damage: enemy.projectileDamage, color: enemy.color, originId: enemy.id,
        radius: (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE
    };

    if (enemy.isRicochet) {
        const wallX = (targetPlayer.x > enemy.x) ? LOGICAL_WIDTH : 0;
        const virtualPlayerX = (wallX === 0) ? -targetPlayer.x : (2 * LOGICAL_WIDTH - targetPlayer.x);
        const angle = Math.atan2((targetPlayer.y + playerLogicalHeight/2) - projectile.y, (virtualPlayerX + playerLogicalWidth/2) - projectile.x);
        const speed = (14 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR;
        projectile.vx = Math.cos(angle) * speed; projectile.vy = Math.sin(angle) * speed;
        projectile.canRicochet = true; projectile.bouncesLeft = 1;
    } else {
        const angle = Math.atan2((targetPlayer.y + playerLogicalHeight/2) - projectile.y, (targetPlayer.x + playerLogicalWidth/2) - projectile.x);
        const speed = enemy.isSniper ? ((16 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR) : ((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR);
        projectile.vx = Math.cos(angle) * speed; projectile.vy = Math.sin(angle) * speed;
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

        // LÓGICA DE HORDAS E SPAWN
        if (room.gameTime > 1 && room.gameTime % 60 === 0) {
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    room.wave++; room.waveState = 'active'; room.bladeHits = {};
                    playerList.forEach(p => {
                        if (p.hasTotalReaction && p.currentReactionCooldown > 0) {
                            p.currentReactionCooldown--;
                            if (p.currentReactionCooldown <= 0) {
                                p.totalReactionReady = true;
                            }
                        }
                    });

                    io.to(roomName).emit('waveStart', room.wave);
                    const waveConfig = getWaveConfig(room.wave);
                    const enemyCount = room.wave + 1;
                    for (let i = 0; i < enemyCount; i++) { if (rooms[roomName]) spawnEnemy(room, waveConfig); }
                    if (room.wave >= 3) { for (let i = 0; i < 1 + Math.floor((room.wave - 3) / 2); i++) spawnSniper(room, waveConfig); }
                    if (room.wave >= 7 && (room.wave - 7) % 2 === 0) { for (let i = 0; i < Math.floor((room.wave - 7) / 2) + 1; i++) spawnRicochet(room, room.wave); }
                    if (room.wave >= 10 && (room.wave - 10) % 3 === 0) { for (let i = 0; i < Math.floor((room.wave - 10) / 3) + 1; i++) spawnBoss(room, room.wave); }
                }
            } else if (room.waveState === 'active' && room.enemies.length === 0) {
                room.waveState = 'intermission'; room.waveTimer = WAVE_INTERVAL_SECONDS;
            }
        }
        
        // LÓGICA DOS RAIOS
        const LIGHTNING_INTERVAL_TICKS = Math.round(9 * (1000 / GAME_TICK_RATE));
        const LIGHTNING_VISUAL_DURATION_TICKS = 30;
        room.lightningStrikes = room.lightningStrikes.filter(s => room.gameTime < s.creationTime + LIGHTNING_VISUAL_DURATION_TICKS);
        if (room.gameTime > 1 && room.gameTime % LIGHTNING_INTERVAL_TICKS === 0) {
            playerList.filter(p => p.hasLightning).forEach(player => {
                for (let i = 0; i < 3; i++) {
                    const strikeX = Math.random() * LOGICAL_WIDTH; const strikeWidth = ((16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR) * 1.2;
                    room.lightningStrikes.push({ id: `strike_${Date.now()}_${Math.random()}`, x: strikeX, width: strikeWidth, creationTime: room.gameTime });
                    room.enemies.forEach(enemy => { if (enemy.x + enemy.width > strikeX - strikeWidth / 2 && enemy.x < strikeX + strikeWidth / 2) { enemy.hp -= Math.floor(WAVE_CONFIG[0].hp * SCALE_DOWN_ATTR_FACTOR); } });
                }
                room.enemies = room.enemies.filter(enemy => {
                    if (enemy.hp <= 0) { io.to(roomName).emit('enemyDied', { enemyId: enemy.id, killerId: player.id, expGain: enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50)) }); return false; }
                    return true;
                });
            });
        }

        // IA DOS INIMIGOS
        room.enemies.forEach(enemy => {
            const targetPlayer = playerList.length > 0 ? playerList.sort((a,b) => Math.hypot(enemy.x-a.x, enemy.y-a.y) - Math.hypot(enemy.x-b.x, enemy.y-b.y))[0] : null;
            let targetY; if (enemy.isSniper) targetY = SNIPER_LINE_Y; else if (enemy.isRicochet) targetY = RICOCHET_LINE_Y; else if (enemy.isBoss) targetY = BOSS_LINE_Y; else targetY = DEFENSE_LINE_Y;
            if (!enemy.reachedPosition) { if (enemy.y < targetY) { enemy.y += enemy.speed; } else { enemy.y = targetY; enemy.baseY = targetY; enemy.reachedPosition = true; enemy.patrolOriginX = enemy.x; } } 
            else { if (enemy.baseY) { enemy.y = enemy.baseY + Math.sin(room.gameTime * 0.05 + (enemy.id.charCodeAt(enemy.id.length-1)||0)%(Math.PI*2)) * 5; } const patrolSpeed = enemy.horizontalSpeed || enemy.speed/2; if (targetPlayer && !enemy.isRicochet) { enemy.x += Math.sign(targetPlayer.x - enemy.x) * patrolSpeed; } const patrolRange = LOGICAL_WIDTH * (enemy.isBoss ? 0.3 : 0.1); const left = enemy.patrolOriginX - (patrolRange/2); const right = enemy.patrolOriginX + (patrolRange/2); if (enemy.x < left) enemy.x = left; if (enemy.x > right - enemy.width) enemy.x = right - enemy.width; }
            const now = Date.now(); if (enemy.reachedPosition && now > (enemy.lastShotTime || 0) + enemy.shootCooldown) { if(room.gameTime >= (room.classShootingCooldowns[enemy.type] || 0)) { shootForEnemy(enemy, room, targetPlayer); room.classShootingCooldowns[enemy.type] = room.gameTime + ENEMY_SHOOT_DELAY_TICKS; } }
        });

        // PROJÉTEIS INIMIGOS E COLISÃO
        for (let i = room.enemyProjectiles.length - 1; i >= 0; i--) {
            const p = room.enemyProjectiles[i];
            if (p.canRicochet && p.bouncesLeft > 0 && (p.x <= 0 || p.x >= LOGICAL_WIDTH)) { p.vx *= -1; p.bouncesLeft--; p.x = p.x <= 0 ? 1 : LOGICAL_WIDTH-1; }
            p.x += p.vx; p.y += p.vy;
            if (p.y > LOGICAL_HEIGHT+50 || p.y < -50 || p.x < -50 || p.x > LOGICAL_WIDTH+50) { room.enemyProjectiles.splice(i, 1); continue; }
            const pW = (16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR; const pH = (22 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR;
            for (const player of playerList) {
                if (player.shield && player.shield.active) {
                    const shieldRadius = player.ally ? player.shield.baseRadius * 1.8 : player.shield.baseRadius;
                    const dx = p.x - (player.x + player.width / 2);
                    const dy = p.y - (player.y + player.height / 2);
                    if (Math.hypot(dx, dy) < shieldRadius + p.radius) {
                        player.shield.hp -= p.damage;
                        if(player.shield.hp <= 0) player.shield.active = false;
                        room.enemyProjectiles.splice(i, 1);
                        break; 
                    }
                }
                if ((p.x > player.x && p.x < player.x + pW && p.y > player.y && p.y < player.y + pH) ||
                    (player.ally && p.x > player.ally.x && p.x < player.ally.x + player.ally.width && p.y > player.ally.y && p.y < player.ally.y + player.ally.height)) {
                    io.to(player.id).emit('playerHit', p.damage); 
                    room.enemyProjectiles.splice(i, 1);
                    break;
                }
            }
        }
        
        // ATUALIZAÇÃO: LÓGICA DOS PROJÉTEIS DOS JOGADORES
        for (let i = room.playerProjectiles.length - 1; i >= 0; i--) {
            const p = room.playerProjectiles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > LOGICAL_WIDTH || p.y < 0 || p.y > LOGICAL_HEIGHT) {
                room.playerProjectiles.splice(i, 1);
                continue;
            }

            for (let j = room.enemies.length - 1; j >= 0; j--) {
                const enemy = room.enemies[j];
                if (p.x > enemy.x && p.x < enemy.x + enemy.width && p.y > enemy.y && p.y < enemy.y + enemy.height) {
                    enemy.hp -= p.damage;
                    room.playerProjectiles.splice(i, 1);

                    if (enemy.hp <= 0) {
                        const killerId = p.ownerId;
                        const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                        room.enemies.splice(j, 1);
                        io.to(roomName).emit('enemyDied', { enemyId: enemy.id, killerId, expGain });
                    }
                    break;
                }
            }
        }

        io.to(roomName).emit('gameState', room);
    }
}, GAME_TICK_RATE);


io.on('connection', (socket) => {
    socket.on('joinMultiplayer', (playerData) => {
        const roomName = findOrCreateRoom();
        socket.join(roomName); socket.room = roomName;
        const room = rooms[roomName]; const color = room.availableColors.length > 0 ? room.availableColors.shift() : AVAILABLE_PLAYER_COLORS[Object.keys(room.players).length % AVAILABLE_PLAYER_COLORS.length];
        room.players[socket.id] = { 
            id: socket.id, 
            ...playerData, 
            hasAlly: false, 
            hasLightning: false, 
            hasTotalReaction: false, 
            totalReactionReady: false,
            currentReactionCooldown: 0,
            totalReactionCooldown: 3,
            hasCorpseExplosion: false, 
            corpseExplosionLevel: 0, 
            allyCooldownWave: 0,
            shield: { active: false, hp: 0, maxHp: 2250, baseRadius: ((16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR) * 0.8 * 1.1 },
            color
        };
        socket.emit('roomJoined', { logicalWidth: LOGICAL_WIDTH, logicalHeight: LOGICAL_HEIGHT });
    });

    socket.on('playerUpdate', (data) => { 
        if (socket.room && rooms[socket.room] && rooms[socket.room].players[socket.id]) { 
            const player = rooms[socket.room].players[socket.id];
            player.x = data.x;
            player.y = data.y;
            player.hp = data.hp;
            if (data.shield) {
                player.shield.active = data.shield.active;
                player.shield.hp = data.shield.hp;
            }
        } 
    });

    // ATUALIZAÇÃO: Servidor cria o projétil
    socket.on('playerShoot', (bulletData) => {
        const room = rooms[socket.room];
        if (!room || !room.players[socket.id]) return;
        
        const newProjectile = {
            id: `proj_${Date.now()}_${Math.random()}`,
            ownerId: socket.id,
            x: bulletData.x,
            y: bulletData.y,
            vx: Math.cos(bulletData.angle) * bulletData.speed,
            vy: Math.sin(bulletData.angle) * bulletData.speed,
            damage: bulletData.damage,
            color: bulletData.color,
            radius: (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE
        };
        
        room.playerProjectiles.push(newProjectile);
    });
    
    // ATUALIZAÇÃO: Evento 'enemyHit' foi removido pois o servidor agora lida com a colisão

    socket.on('playerUsedTotalReaction', () => { 
        const room = rooms[socket.room]; 
        if(room && room.players[socket.id]) {
            const player = room.players[socket.id];
            player.bladeHits[socket.id] = []; 
            player.totalReactionReady = false;
            player.currentReactionCooldown = player.totalReactionCooldown + 1;
        }
    });

    socket.on('bladeHitEnemy', (enemyId) => {
        const room = rooms[socket.room]; if (!room) return;
        const player = room.players[socket.id]; const enemy = room.enemies.find(e => e.id === enemyId);
        if (player && player.hasTotalReaction && enemy && room.bladeHits[socket.id] && !room.bladeHits[socket.id].includes(enemyId)) {
            room.bladeHits[socket.id].push(enemyId);
            enemy.hp -= enemy.maxHp * 0.7;
            if (enemy.hp <= 0) {
                 room.enemies = room.enemies.filter(e => e.id !== enemyId);
                 io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id, expGain: enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50)) });
            }
        }
    });
    socket.on('enemyProjectileDestroyed', (id) => { if(socket.room && rooms[socket.room]) rooms[socket.room].enemyProjectiles = rooms[socket.room].enemyProjectiles.filter(p => p.id !== id); });
    
    socket.on('playerGotAlly', () => { if(socket.room && rooms[socket.room] && rooms[socket.room].players[socket.id]) rooms[socket.room].players[socket.id].hasAlly = true; });
    socket.on('playerLostAlly', () => { if(socket.room && rooms[socket.room] && rooms[socket.room].players[socket.id]) { rooms[socket.room].players[socket.id].hasAlly = false; rooms[socket.room].players[socket.id].allyCooldownWave = rooms[socket.room].wave + 2; }});
    socket.on('playerGotLightning', () => { if(socket.room && rooms[socket.room] && rooms[socket.room].players[socket.id]) rooms[socket.room].players[socket.id].hasLightning = true; });
    socket.on('playerGotCorpseExplosion', ({ level }) => { if(socket.room && rooms[socket.room] && rooms[socket.room].players[socket.id]) { rooms[socket.room].players[socket.id].hasCorpseExplosion = true; rooms[socket.room].players[socket.id].corpseExplosionLevel = level; } });
    
    socket.on('playerGotTotalReaction', () => { 
        const room = rooms[socket.room];
        if (room && rooms[socket.room].players[socket.id] && !room.totalReactionHolderId) {
            room.totalReactionHolderId = socket.id;
            const player = rooms[socket.room].players[socket.id];
            player.hasTotalReaction = true;
            player.totalReactionReady = true;
        }
    });

    socket.on('disconnect', () => {
        const roomName = socket.room;
        if (roomName && rooms[roomName]) {
            if (rooms[roomName].totalReactionHolderId === socket.id) {
                rooms[roomName].totalReactionHolderId = null;
            }
            const player = rooms[roomName].players[socket.id];
            if (player && player.color) rooms[roomName].availableColors.unshift(player.color);
            delete rooms[roomName].players[socket.id];
            if(rooms[roomName].bladeHits) delete rooms[roomName].bladeHits[socket.id];
            io.to(roomName).emit('playerLeft', socket.id);
            if (Object.keys(rooms[roomName].players).length === 0) delete rooms[roomName];
        }
    });
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
