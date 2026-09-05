const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const db = require("./database");

const app = express();
const PORT = 3000;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("❌ ERROR: Falta JWT_SECRET en el archivo .env");
    process.exit(1);
}

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// ESTADO DEL SERVIDOR
// ==========================================

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        online: true,
        message: "🔥 FORGE V2 SERVER ONLINE"
    });
});

// ==========================================
// REGISTRO
// ==========================================

app.post("/api/register", async (req, res) => {

    try {

        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Todos los campos son obligatorios"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (cleanName.length < 2) {
            return res.status(400).json({
                success: false,
                message: "El nombre es demasiado corto"
            });
        }

        const existingUser = db.prepare(`
            SELECT id
            FROM users
            WHERE email = ?
        `).get(cleanEmail);

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Ese email ya está registrado"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = db.prepare(`
            INSERT INTO users (
                name,
                email,
                password
            )
            VALUES (?, ?, ?)
        `).run(
            cleanName,
            cleanEmail,
            passwordHash
        );

        const userId = Number(result.lastInsertRowid);

        db.prepare(`
            INSERT INTO profiles (
                user_id
            )
            VALUES (?)
        `).run(userId);

        console.log("");
        console.log("================================");
        console.log("👤 NUEVO USUARIO");
        console.log("ID:", userId);
        console.log("Nombre:", cleanName);
        console.log("Email:", cleanEmail);
        console.log("📊 Perfil creado");
        console.log("================================");
        console.log("");

        res.status(201).json({
            success: true,
            message: "🔥 Usuario registrado correctamente",
            user: {
                id: userId,
                name: cleanName,
                email: cleanEmail
            }
        });

    } catch (error) {

        console.error("❌ Error registrando usuario:", error);

        res.status(500).json({
            success: false,
            message: "Error interno del servidor"
        });
    }
});

// ==========================================
// LOGIN
// ==========================================

app.post("/api/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        console.log("");
        console.log("🔐 Intento de login...");

        if (!email || !password) {

            return res.status(400).json({
                success: false,
                message: "Email y contraseña son obligatorios"
            });
        }

        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(cleanEmail);

        if (!user) {

            console.log("❌ Usuario no encontrado");

            return res.status(401).json({
                success: false,
                message: "Email o contraseña incorrectos"
            });
        }

        const passwordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordCorrect) {

            console.log("❌ Contraseña incorrecta");

            return res.status(401).json({
                success: false,
                message: "Email o contraseña incorrectos"
            });
        }

        // ==========================================
        // CREAR TOKEN
        // ==========================================

        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                email: user.email
            },
            JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        console.log("================================");
        console.log("🔐 LOGIN CORRECTO");
        console.log("👤 Usuario:", user.name);
        console.log("📧 Email:", user.email);
        console.log("================================");
        console.log("");

        res.json({
            success: true,
            message: "🔥 Inicio de sesión correcto",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {

        console.error("❌ ERROR EN LOGIN:", error);

        res.status(500).json({
            success: false,
            message: "Error interno del servidor"
        });
    }
});

// ==========================================
// FUNCIÓN PARA VERIFICAR TOKEN
// ==========================================

function authenticateToken(req, res, next) {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "No estás autenticado"
            });
        }

        const parts = authHeader.split(" ");

        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer"
        ) {
            return res.status(401).json({
                success: false,
                message: "Formato de token inválido"
            });
        }

        const token = parts[1];

        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message: "Sesión inválida o expirada"
        });
    }
}

// ==========================================
// OBTENER USUARIO Y PERFIL
// ==========================================

app.get(
    "/api/me",
    authenticateToken,
    (req, res) => {

        try {

            const user = db.prepare(`
                SELECT
                    id,
                    name,
                    email,
                    created_at
                FROM users
                WHERE id = ?
            `).get(req.user.id);

            if (!user) {

                return res.status(404).json({
                    success: false,
                    message: "Usuario no encontrado"
                });
            }

            let profile = db.prepare(`
                SELECT
                    id,
                    user_id,
                    goal,
                    weight,
                    height,
                    age,
                    level,
                    xp,
                    created_at
                FROM profiles
                WHERE user_id = ?
            `).get(user.id);

            // ==========================================
            // CREAR PERFIL SI NO EXISTE
            // ==========================================

            if (!profile) {

                db.prepare(`
                    INSERT INTO profiles (
                        user_id
                    )
                    VALUES (?)
                `).run(user.id);

                profile = db.prepare(`
                    SELECT
                        id,
                        user_id,
                        goal,
                        weight,
                        height,
                        age,
                        level,
                        xp,
                        created_at
                    FROM profiles
                    WHERE user_id = ?
                `).get(user.id);
            }

            res.json({
                success: true,

                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    created_at: user.created_at
                },

                profile: {
                    id: profile.id,
                    user_id: profile.user_id,
                    goal: profile.goal,
                    weight: profile.weight,
                    height: profile.height,
                    age: profile.age,
                    level: profile.level,
                    xp: profile.xp,
                    created_at: profile.created_at
                }
            });

        } catch (error) {

            console.error(
                "❌ Error obteniendo perfil:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Error obteniendo perfil"
            });
        }
    }
);

// ==========================================
// ACTUALIZAR PERFIL
// ==========================================

app.put(
    "/api/profile",
    authenticateToken,
    (req, res) => {

        try {

            const {
                goal,
                weight,
                height,
                age,
                level
            } = req.body;

            const user = db.prepare(`
                SELECT id
                FROM users
                WHERE id = ?
            `).get(req.user.id);

            if (!user) {

                return res.status(404).json({
                    success: false,
                    message: "Usuario no encontrado"
                });
            }

            db.prepare(`
                INSERT OR IGNORE INTO profiles (
                    user_id
                )
                VALUES (?)
            `).run(user.id);

            db.prepare(`
                UPDATE profiles

                SET
                    goal = ?,
                    weight = ?,
                    height = ?,
                    age = ?,
                    level = ?

                WHERE user_id = ?
            `).run(

                goal || "Mejorar mi condición física",

                Number(weight) || 0,

                Number(height) || 0,

                Number(age) || 0,

                level || "Principiante",

                user.id
            );

            const profile = db.prepare(`
                SELECT
                    id,
                    user_id,
                    goal,
                    weight,
                    height,
                    age,
                    level,
                    xp,
                    created_at
                FROM profiles
                WHERE user_id = ?
            `).get(user.id);

            res.json({

                success: true,

                message: "🔥 Perfil actualizado correctamente",

                profile
            });

        } catch (error) {

            console.error(
                "❌ Error actualizando perfil:",
                error
            );

            res.status(500).json({
                success: false,
                message: "No se pudo actualizar el perfil"
            });
        }
    }
);

// ==========================================
// 404 PARA API
// ==========================================

app.use("/api", (req, res) => {

    res.status(404).json({

        success: false,

        message: "❌ Ruta API no encontrada",

        route: req.originalUrl
    });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
// =========================================================
// 🟢 FORGE ONLINE SYSTEM
// =========================================================

const onlineUsers = new Map();

app.post("/api/online/heartbeat", authenticateToken, (req, res) => {

    const userId = req.user.id;

    onlineUsers.set(userId, {
        id: userId,
        lastSeen: Date.now()
    });

    cleanupOnlineUsers();

    res.json({
        success: true,
        online: onlineUsers.size
    });

});


app.get("/api/online", authenticateToken, (req, res) => {

    cleanupOnlineUsers();

    const users = [];

    for (const [userId] of onlineUsers) {

        const user = db.prepare(`
            SELECT
                users.id,
                users.name,
                profiles.level,
                profiles.xp
            FROM users
            LEFT JOIN profiles
                ON profiles.user_id = users.id
            WHERE users.id = ?
        `).get(userId);

        if (user) {

            users.push({
                id: user.id,
                name: user.name,
                level: user.level || "Principiante",
                xp: user.xp || 0
            });

        }

    }

    res.json({
        count: users.length,
        users
    });

});


function cleanupOnlineUsers() {

    const now = Date.now();

    for (const [userId, info] of onlineUsers) {

        // 30 segundos sin heartbeat = desconectado

        if (now - info.lastSeen > 30000) {

            onlineUsers.delete(userId);

        }

    }

}
app.listen(
    PORT,
    () => {

        console.log("");
        console.log("========================================");
        console.log("🔥 FORGE V2 SERVER ONLINE");
        console.log("========================================");
        console.log(
            `🌐 http://localhost:${PORT}`
        );
        console.log("🗄️ Base de datos conectada");
        console.log("🔐 Autenticación JWT activa");
        console.log("👤 Sistema de usuarios activo");
        console.log("📊 Sistema de perfiles activo");
        console.log("========================================");
        console.log("");
    }
);
