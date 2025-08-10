// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./database');

// --- ATUALIZADO: Classe Quadtree para otimização de colisão no SERVIDOR ---
class Quadtree {
    constructor(bounds, maxObjects = 10, maxLevels = 4, level = 0) {
        this.bounds = bounds; this.maxObjects = maxObjects; this.maxLevels = maxLevels; this.level = level; this.objects = []; this.nodes = [];
    }
    split() {
        const nextLevel = this.level + 1, subWidth = this.bounds.width / 2, subHeight = this.bounds.height / 2, x = this.bounds.x, y = this.bounds.y;
        this.nodes[0] = new Quadtree({ x: x + subWidth, y: y, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[1] = new Quadtree({ x: x, y: y, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[2] = new Quadtree({ x: x, y: y + subHeight, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[3] = new Quadtree({ x: x + subWidth, y: y + subHeight, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
    }
    getIndex(rect) {
        let index = -1; const vMid = this.bounds.x + (this.bounds.width / 2); const hMid = this.bounds.y + (this.bounds.height / 2);
        const rectWidth = rect.width || rect.radius * 2; const rectHeight = rect.height || rect.radius * 2;
        const top = (rect.y < hMid && rect.y + rectHeight < hMid); const bottom = (rect.y > hMid);
        if (rect.x < vMid && rect.x + rectWidth < vMid) { if (top) index = 1; else if (bottom) index = 2; }
        else if (rect.x > vMid) { if (top) index = 0; else if (bottom) index = 3; }
        return index;
    }
    insert(rect) {
        if (this.nodes.length) { const index = this.getIndex(rect); if (index !== -1) { this.nodes[index].insert(rect); return; } }
        this.objects.push(rect);
        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (!this.nodes.length) { this.split(); }
            let i = 0;
            while (i < this.objects.length) {
                const index = this.getIndex(this.objects[i]);
                if (index !== -1) { this.nodes[index].insert(this.objects.splice(i, 1)[0]); } else { i++; }
            }
        }
    }
    retrieve(rect) {
        let returnObjects = this.objects; const index = this.getIndex(rect);
        if (this.nodes.length && index !== -1) { returnObjects = returnObjects.concat(this.nodes[index].retrieve(rect)); }
        return returnObjects;
    }
    clear() { this.objects = []; for (let i = 0; i < this.nodes.length; i++) { if (this.nodes.length) { this.nodes[i].clear(); } } this.nodes = []; }
}

// --- ATUALIZADO: Classe de Projéteis para Pooling no Servidor ---
class ServerProjectile {
    constructor() {
        this.active = false;
        this.id = ''; this.ownerId = '';
        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.damage = 0; this.color = '';
        this.radius = 0;
        this.canRicochet = false; this.bouncesLeft = 0;
    }

    spawn(id, ownerId, x, y, vx, vy, damage, color, radius, canRicochet = false, bouncesLeft = 0) {
        this.active = true;
        this.id = id; this.ownerId = ownerId;
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.damage = damage; this.color = color; this.radius = radius;
        this.canRicochet = canRicochet; this.bouncesLeft = bouncesLeft;
        return this;
    }
}


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
        const { name, timeSurvived, waveReached } = req.body;
        if (!name || typeof timeSurvived !== 'number' || typeof waveReached !== 'number') {
            return res.status(400).json({ error: "Dados inválidos." });
        }
        await db.addScore(name, timeSurvived, waveReached);
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
const MAX_PROJECTILES_PER_ROOM = 500;

const AVAILABLE_PLAYER_COLORS = ['#FFD700', '#9400D3', '#32CD32', '#FF8C00'];

const DEFENSE_LINE_Y = LOGICAL_HEIGHT * 0.5 * 0.75;
const BOSS_LINE_Y = LOGICAL_HEIGHT * 0.3 * 0.75;
const RICOCHET_LINE_Y = LOGICAL_HEIGHT * 0.2 * 0.75;
const SNIPER_LINE_Y = LOGICAL_HEIGHT * 0.1 * 0.75;

const ENEMY_SIZE_MOD = SCALE_UP_SIZE_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
const WAVE_CONFIG = [
    { type: 'basic', color: '#FF4136', hp: Math.floor((72 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.04 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3600, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((90 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((12 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3360, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((120 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.2 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((15 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 3000, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((168 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.28 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((25 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((18 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2640, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD },
    { type: 'basic', color: '#FF4136', hp: Math.floor((210 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (1.36 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((30 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((22 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 2400, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD }
];
const BOSS_CONFIG = { type: 'boss', color: '#FFFFFF', hp: Math.floor((300 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR) + 80, speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, damage: Math.floor((50 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), projectileDamage: Math.floor((35 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 1440, width: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (30 * SCALE_FACTOR) * ENEMY_SIZE_MOD, isBoss: true };
const RICOCHET_CONFIG = { type: 'ricochet', color: '#FF69B4', hp: Math.floor((150 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), speed: (0.96 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.6 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, projectileDamage: Math.floor((20 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR), shootCooldown: 4200, isRicochet: true, width: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (10 * SCALE_FACTOR) * ENEMY_SIZE_MOD };
const SNIPER_CONFIG = { type: 'sniper', color: '#00FFFF', speed: (0.8 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, horizontalSpeed: (0.5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR, isSniper: true, width: (8 * SCALE_FACTOR) * ENEMY_SIZE_MOD, height: (13 * SCALE_FACTOR) * ENEMY_SIZE_MOD };
const WAVE_INTERVAL_SECONDS = 10;

function checkCollision(obj1, obj2) {
    if (obj1.radius && obj2.radius) {
        const dx = obj1.x - obj2.x; const dy = obj1.y - obj2.y;
        const distance = Math.hypot(dx, dy);
        return distance < obj1.radius + obj2.radius;
    }
    const r1 = obj1.radius || 0; const r2 = obj2.radius || 0;
    const w1 = obj1.width || 0; const h1 = obj1.height || 0;
    const w2 = obj2.width || 0; const h2 = obj2.height || 0;
    const obj1Left = obj1.x - r1; const obj1Right = obj1.x + (w1 || r1);
    const obj1Top = obj1.y - r1; const obj1Bottom = obj1.y + (h1 || r1);
    const obj2Left = obj2.x - r2; const obj2Right = obj2.x + (w2 || r2);
    const obj2Top = obj2.y - r2; const obj2Bottom = obj2.y + (h2 || r2);
    return (obj1Left < obj2Right && obj1Right > obj2Left && obj1Top < obj2Bottom && obj1Bottom > obj2Top);
}

function getScalingFactor(wave) { if (wave <= 1) return 1.0; return 1.0 + Math.min(0.40, (wave - 1) * 0.05); }
function getWaveConfig(wave) { const base = wave <= WAVE_CONFIG.length ? WAVE_CONFIG[wave - 1] : WAVE_CONFIG[WAVE_CONFIG.length - 1]; const scale = getScalingFactor(wave); return { ...base, hp: Math.floor(base.hp * scale), damage: Math.floor(base.damage * scale), projectileDamage: Math.floor(base.projectileDamage * scale) }; }
function getBossConfig(wave) { const scale = getScalingFactor(wave); return { ...BOSS_CONFIG, hp: Math.floor(BOSS_CONFIG.hp * scale), damage: Math.floor(BOSS_CONFIG.damage * scale), projectileDamage: Math.floor(BOSS_CONFIG.projectileDamage * scale) }; }
function getRicochetConfig(wave) { const scale = getScalingFactor(wave); return { ...RICOCHET_CONFIG, hp: Math.floor(RICOCHET_CONFIG.hp * scale), projectileDamage: Math.floor(RICOCHET_CONFIG.projectileDamage * scale) }; }

function findOrCreateRoom() {
    for (const name in rooms) { if (Object.keys(rooms[name].players).length < MAX_PLAYERS_PER_ROOM) return name; }
    const newName = `room_${Date.now()}`;
    const newRoom = { 
        players: {}, enemies: [], lightningStrikes: [], gameTime: 0, wave: 0, 
        waveState: 'intermission', waveTimer: WAVE_INTERVAL_SECONDS, classShootingCooldowns: {}, bladeHits: {}, 
        availableColors: [...AVAILABLE_PLAYER_COLORS], totalReactionHolderId: null,
        // --- ATUALIZADO: Cada sala tem seu próprio quadtree e pools de projéteis ---
        quadtree: new Quadtree({ x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT }),
        playerProjectiles: [],
        enemyProjectiles: [],
    };
    for(let i = 0; i < MAX_PROJECTILES_PER_ROOM; i++) {
        newRoom.playerProjectiles.push(new ServerProjectile());
        newRoom.enemyProjectiles.push(new ServerProjectile());
    }
    rooms[newName] = newRoom;
    return newName;
}

// --- ATUALIZADO: Funções de spawn de projéteis do pool do servidor ---
function spawnProjectileFromPool(pool, ...args) {
    for(const p of pool) {
        if (!p.active) {
            return p.spawn(...args);
        }
    }
    return null; // Pool cheio
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
    
    const startX = enemy.x + enemy.width / 2;
    const startY = enemy.y + enemy.height / 2;
    const radius = (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE;
    let angle, speed, isRicochet = false;

    if (enemy.isRicochet) {
        const wallX = (targetPlayer.x > enemy.x) ? LOGICAL_WIDTH : 0;
        const virtualPlayerX = (wallX === 0) ? -targetPlayer.x : (2 * LOGICAL_WIDTH - targetPlayer.x);
        angle = Math.atan2((targetPlayer.y + playerLogicalHeight/2) - startY, (virtualPlayerX + playerLogicalWidth/2) - startX);
        speed = (14 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR;
        isRicochet = true;
    } else {
        angle = Math.atan2((targetPlayer.y + playerLogicalHeight/2) - startY, (targetPlayer.x + playerLogicalWidth/2) - startX);
        speed = enemy.isSniper ? ((16 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR) : ((10 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR);
    }
    
    spawnProjectileFromPool(room.enemyProjectiles, `ep_${now}_${Math.random()}`, enemy.id, startX, startY, Math.cos(angle) * speed, Math.sin(angle) * speed, enemy.projectileDamage, enemy.color, radius, isRicochet, isRicochet ? 1 : 0);
}

// Game loop do servidor
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        const playerList = Object.values(room.players);
        if (playerList.length === 0) { delete rooms[roomName]; continue; }
        room.gameTime++;

        // --- ATUALIZADO: Limpar e preencher o quadtree da sala ---
        room.quadtree.clear();
        playerList.forEach(p => {
            room.quadtree.insert(p);
            if (p.shield && p.shield.active) {
                 const shieldRadius = p.hasAlly ? p.shield.baseRadius * 1.8 : p.shield.baseRadius;
                 const shieldHitbox = { x: p.x + p.width / 2, y: p.y + p.height / 2, radius: shieldRadius, isShieldFor: p.id };
                 room.quadtree.insert(shieldHitbox);
            }
             if (p.hasAlly) {
                const allyHitbox = { width: p.width / 1.5, height: p.height / 1.5, x: p.x - (p.width / 1.5) - 10, y: p.y, isAllyFor: p.id };
                room.quadtree.insert(allyHitbox);
            }
        });
        room.enemies.forEach(e => room.quadtree.insert(e));
        
        // --- LÓGICA DE HORDAS E SPAWN ---
        if (room.gameTime > 1 && room.gameTime % 60 === 0) {
            if (room.waveState === 'intermission') {
                room.waveTimer--;
                if (room.waveTimer <= 0) {
                    room.wave++; room.waveState = 'active'; room.bladeHits = {};
                    playerList.forEach(p => { if (p.hasTotalReaction && p.currentReactionCooldown > 0) { p.currentReactionCooldown--; if (p.currentReactionCooldown <= 0) p.totalReactionReady = true; }});
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
        
        // --- LÓGICA DOS RAIOS E IA DOS INIMIGOS (sem grandes alterações) ---
        // ... (Lógica de raios e movimento de inimigos) ...
        
        // --- ATUALIZADO: Loop de Colisões com Quadtree e Pooling ---
        // 1. Atualiza projéteis inimigos e checa colisão
        room.enemyProjectiles.forEach(p => {
            if (!p.active) return;
            if (p.canRicochet && p.bouncesLeft > 0 && (p.x <= 0 || p.x >= LOGICAL_WIDTH)) { p.vx *= -1; p.bouncesLeft--; p.x = p.x <= 0 ? 1 : LOGICAL_WIDTH - 1; }
            p.x += p.vx; p.y += p.vy;
            if (p.y > LOGICAL_HEIGHT + 50 || p.y < -50 || p.x < -50 || p.x > LOGICAL_WIDTH + 50) { p.active = false; return; }
            
            const potentialColliders = room.quadtree.retrieve(p);
            for (const collider of potentialColliders) {
                if (!p.active) break;
                if (collider.isShieldFor && checkCollision(p, collider)) {
                    const owner = room.players[collider.isShieldFor];
                    if (owner) { owner.shield.hp -= p.damage; if(owner.shield.hp <= 0) owner.shield.active = false; }
                    p.active = false;
                } else if (collider.isAllyFor && checkCollision(p, collider)) {
                    io.to(collider.isAllyFor).emit('allyHit', p.damage);
                    p.active = false;
                } else if (collider.id && room.players[collider.id] && checkCollision(p, collider)) {
                    io.to(collider.id).emit('playerHit', p.damage);
                    p.active = false;
                }
            }
        });

        // 2. Atualiza projéteis de jogadores e checa colisão
        room.playerProjectiles.forEach(p => {
            if (!p.active) return;
            p.x += p.vx; p.y += p.vy;
            if (p.x < -10 || p.x > LOGICAL_WIDTH + 10 || p.y < -10 || p.y > LOGICAL_HEIGHT + 10) { p.active = false; return; }
            
            const potentialEnemies = room.quadtree.retrieve(p).filter(o => o.maxHp);
            for (const enemy of potentialEnemies) {
                if (checkCollision(p, enemy)) {
                    enemy.hp -= p.damage;
                    p.active = false;
                    if (enemy.hp <= 0) {
                        const killerId = p.ownerId;
                        const expGain = enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50));
                        room.enemies = room.enemies.filter(e => e.id !== enemy.id);
                        io.to(roomName).emit('enemyDied', { enemyId: enemy.id, killerId, expGain });
                    }
                    break;
                }
            }
        });
        
        // --- ATUALIZADO: Enviar apenas dados necessários ---
        const stateToSend = {
            gameTime: room.gameTime,
            wave: room.wave,
            waveState: room.waveState,
            waveTimer: room.waveTimer,
            players: room.players,
            enemies: room.enemies,
            playerProjectiles: room.playerProjectiles.filter(p => p.active),
            enemyProjectiles: room.enemyProjectiles.filter(p => p.active),
            lightningStrikes: room.lightningStrikes
        };
        io.to(roomName).emit('gameState', stateToSend);
    }
}, GAME_TICK_RATE);


io.on('connection', (socket) => {
    socket.on('joinMultiplayer', (playerData) => {
        const roomName = findOrCreateRoom();
        socket.join(roomName); socket.room = roomName;
        const room = rooms[roomName]; const color = room.availableColors.length > 0 ? room.availableColors.shift() : AVAILABLE_PLAYER_COLORS[Object.keys(room.players).length % AVAILABLE_PLAYER_COLORS.length];
        room.players[socket.id] = { 
            id: socket.id, ...playerData, hasAlly: false, hasLightning: false, hasTotalReaction: false, 
            totalReactionReady: false, currentReactionCooldown: 0, totalReactionCooldown: 3,
            hasCorpseExplosion: false, corpseExplosionLevel: 0, allyCooldownWave: 0,
            shield: { active: false, hp: 0, maxHp: 2250, baseRadius: ((16 * SCALE_FACTOR) * SCALE_UP_SIZE_FACTOR) * 0.8 * 1.1 * 1.1 },
            color
        };
        socket.emit('roomJoined', { logicalWidth: LOGICAL_WIDTH, logicalHeight: LOGICAL_HEIGHT });
    });

    socket.on('playerUpdate', (data) => { 
        if (socket.room && rooms[socket.room] && rooms[socket.room].players[socket.id]) { 
            const player = rooms[socket.room].players[socket.id];
            player.x = data.x; player.y = data.y; player.hp = data.hp;
            if (data.shield) { player.shield.active = data.shield.active; player.shield.hp = data.shield.hp; }
        } 
    });

    socket.on('playerShoot', (bulletData) => {
        const room = rooms[socket.room];
        if (!room || !room.players[socket.id]) return;
        
        spawnProjectileFromPool(
            room.playerProjectiles,
            `proj_${Date.now()}_${Math.random()}`,
            socket.id,
            bulletData.x,
            bulletData.y,
            Math.cos(bulletData.angle) * bulletData.speed,
            Math.sin(bulletData.angle) * bulletData.speed,
            bulletData.damage,
            bulletData.color,
            (5 * SCALE_FACTOR) * SCALE_DOWN_ATTR_FACTOR * ENEMY_AND_PROJECTILE_SIZE_INCREASE
        );
    });
    
    socket.on('playerUsedTotalReaction', () => { 
        const room = rooms[socket.room]; 
        if(room && room.players[socket.id]) {
            const player = room.players[socket.id];
            if (!room.bladeHits) room.bladeHits = {};
            room.bladeHits[socket.id] = []; 
            player.totalReactionReady = false;
            player.currentReactionCooldown = player.totalReactionCooldown + 1;
        }
    });

    socket.on('bladeHitEnemy', (enemyId) => {
        const room = rooms[socket.room]; if (!room) return;
        const player = room.players[socket.id]; const enemy = room.enemies.find(e => e.id === enemyId);
        if (player && player.hasTotalReaction && enemy && room.bladeHits && room.bladeHits[socket.id] && !room.bladeHits[socket.id].includes(enemyId)) {
            room.bladeHits[socket.id].push(enemyId);
            enemy.hp -= enemy.maxHp * 0.7;
            if (enemy.hp <= 0) {
                 room.enemies = room.enemies.filter(e => e.id !== enemyId);
                 io.to(socket.room).emit('enemyDied', { enemyId, killerId: socket.id, expGain: enemy.isBoss ? 1000 : (enemy.isSniper ? 75 : (enemy.isRicochet ? 60 : 50)) });
            }
        }
    });
    socket.on('enemyProjectileDestroyed', (id) => { 
        if(socket.room && rooms[socket.room]) {
            const proj = rooms[socket.room].enemyProjectiles.find(p => p.id === id);
            if(proj) proj.active = false;
        }
    });
    
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
