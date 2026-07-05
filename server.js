/**
 * RL Australia - Standalone API Server
 * Runs independently of Medusa for auth + custom endpoints
 * Start with: node server.js
 */

require("dotenv").config()
const express = require("express")
const cors = require("cors")
const { Pool } = require("pg")
const crypto = require("crypto")

const app = express()
const PORT = process.env.PORT || 9000

// Database
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Middleware
app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://localhost:8000",
        process.env.STORE_CORS || ""
    ].filter(Boolean),
    credentials: true,
}))
app.use(express.json())

// ============ HELPERS ============

const JWT_SECRET = process.env.JWT_SECRET || "RlAustraliaJWTSecretStoreKey123!"

function hashPassword(password) {
    return crypto.createHash("sha256").update(password + JWT_SECRET).digest("hex")
}

function generateToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const body = Buffer.from(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    })).toString("base64url")
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url")
    return `${header}.${body}.${signature}`
}

function verifyToken(token) {
    try {
        const [header, body, signature] = token.split(".")
        const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url")
        if (signature !== expectedSig) return null
        const payload = JSON.parse(Buffer.from(body, "base64url").toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload
    } catch { return null }
}

// ============ ROUTES ============

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() })
})

// Register
app.post("/store/auth/register", async (req, res) => {
    try {
        const { email, password, first_name, last_name, phone } = req.body

        if (!email || !password || !first_name || !last_name) {
            return res.status(400).json({ message: "email, password, first_name, and last_name are required" })
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" })
        }

        const existing = await pool.query("SELECT id FROM rl_customers WHERE email = $1", [email.toLowerCase()])
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: "A customer with this email already exists" })
        }

        const password_hash = hashPassword(password)
        const result = await pool.query(
            `INSERT INTO rl_customers (email, password_hash, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, phone`,
            [email.toLowerCase(), password_hash, first_name, last_name, phone || null]
        )

        const customer = result.rows[0]
        const token = generateToken({ id: customer.id, email: customer.email, role: "customer" })

        res.status(201).json({
            message: "Account created successfully",
            token,
            user: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name, role: "customer" },
        })
    } catch (error) {
        console.error("Register error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// Login
app.post("/store/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" })
        }

        // Admin check
        if (email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase() && password === process.env.ADMIN_PASSWORD) {
            const token = generateToken({ email: email.toLowerCase(), role: "admin", id: "admin" })
            return res.status(200).json({
                message: "Login successful",
                token,
                user: { id: "admin", email: email.toLowerCase(), first_name: "Admin", last_name: "User", role: "admin" },
            })
        }

        // Customer check
        const result = await pool.query(
            "SELECT id, email, password_hash, first_name, last_name, phone, is_active FROM rl_customers WHERE email = $1",
            [email.toLowerCase()]
        )

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" })
        }

        const customer = result.rows[0]
        if (!customer.is_active) {
            return res.status(401).json({ message: "Account is disabled" })
        }

        if (hashPassword(password) !== customer.password_hash) {
            return res.status(401).json({ message: "Invalid email or password" })
        }

        const token = generateToken({ id: customer.id, email: customer.email, role: "customer" })

        res.status(200).json({
            message: "Login successful",
            token,
            user: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name, role: "customer" },
        })
    } catch (error) {
        console.error("Login error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// Get current user
app.get("/store/auth/me", async (req, res) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Not authenticated" })
        }

        const payload = verifyToken(authHeader.split(" ")[1])
        if (!payload) {
            return res.status(401).json({ message: "Invalid or expired token" })
        }

        if (payload.role === "admin") {
            return res.status(200).json({
                user: { id: "admin", email: process.env.ADMIN_EMAIL, first_name: "Admin", last_name: "User", role: "admin" },
            })
        }

        const result = await pool.query(
            "SELECT id, email, first_name, last_name, phone FROM rl_customers WHERE id = $1 AND is_active = true",
            [payload.id]
        )

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "User not found" })
        }

        const c = result.rows[0]
        res.status(200).json({ user: { ...c, role: "customer" } })
    } catch (error) {
        res.status(401).json({ message: "Not authenticated" })
    }
})

// ============ START ============

app.listen(PORT, () => {
    console.log(`✓ RL Australia API running on http://localhost:${PORT}`)
    console.log(`  - POST /store/auth/register`)
    console.log(`  - POST /store/auth/login`)
    console.log(`  - GET  /store/auth/me`)
    console.log(`  - GET  /health`)
})
