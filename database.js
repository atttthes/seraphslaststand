// database.js
const { MongoClient } = require('mongodb');

// Para deploy no Render, configure MONGODB_URI como uma variável de ambiente.
// Para testes locais, você pode colar sua string aqui ou usar um arquivo .env
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/gameDB"; 

const client = new MongoClient(uri);

let db;

async function connect() {
    if (db) return db;
    await client.connect();
    console.log("Conectado ao MongoDB com sucesso!");
    db = client.db(); // Se o nome do DB estiver na URI, não precisa passar aqui.
    return db;
}

async function getTopScores(limit = 10) {
    const database = await connect();
    const scoresCollection = database.collection('scores');
    // Encontra, ordena por 'timeSurvived' em ordem decrescente, e limita o resultado
    return await scoresCollection.find().sort({ timeSurvived: -1 }).limit(limit).toArray();
}

async function addScore(name, timeSurvived) {
    const database = await connect();
    const scoresCollection = database.collection('scores');
    const score = {
        name,
        timeSurvived,
        date: new Date()
    };
    return await scoresCollection.insertOne(score);
}

module.exports = { connect, getTopScores, addScore };
