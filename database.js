const Database = require("better-sqlite3");

const db = new Database("forge.db");

console.log("🗄️ Base de datos FORGE V2 conectada");

// ==========================================
// TABLA USERS
// ==========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

console.log("👤 Tabla users lista");

// ==========================================
// TABLA PROFILES
// ==========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        goal TEXT DEFAULT 'Mejorar mi condición física',
        weight REAL DEFAULT 0,
        height REAL DEFAULT 0,
        age INTEGER DEFAULT 0,
        level TEXT DEFAULT 'Principiante',
        xp INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`).run();

console.log("📊 Tabla profiles lista");

// ==========================================
// CREAR PERFILES DE USUARIOS EXISTENTES
// ==========================================

const users = db.prepare(`
    SELECT id
    FROM users
`).all();

for (const user of users) {

    const profile = db.prepare(`
        SELECT id
        FROM profiles
        WHERE user_id = ?
    `).get(user.id);

    if (!profile) {

        db.prepare(`
            INSERT INTO profiles (user_id)
            VALUES (?)
        `).run(user.id);

        console.log(
            `📊 Perfil creado para usuario ${user.id}`
        );
    }
}

module.exports = db;
