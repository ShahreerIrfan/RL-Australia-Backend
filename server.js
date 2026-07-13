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
    origin: (origin, callback) => {
        callback(null, true)
    },
    credentials: true,
}))
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true }))

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

// ============ PRODUCT & UPLOAD ROUTES ============
const path = require("path")
const fs = require("fs")

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "public", "uploads")
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
}
app.use("/uploads", express.static(uploadsDir))

// Initialize Database schema extensions and seed categories
async function initDb() {
    try {
        // Ensure image_gallery column exists in rl_products
        await pool.query("ALTER TABLE rl_products ADD COLUMN IF NOT EXISTS image_gallery text[]")
        
        // Ensure rl_product_variants table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_product_variants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID REFERENCES rl_products(id) ON DELETE CASCADE,
                title VARCHAR(100) NOT NULL,
                sku VARCHAR(100),
                price NUMERIC(10,2) NOT NULL,
                original_price NUMERIC(10,2),
                stock_quantity INTEGER DEFAULT 0,
                weight VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `)
        await pool.query("ALTER TABLE rl_product_variants ADD COLUMN IF NOT EXISTS weight VARCHAR(100)")
        
        // Index on product_id for fast lookups
        await pool.query("CREATE INDEX IF NOT EXISTS idx_rl_product_variants_product_id ON rl_product_variants(product_id)")
        
        const check = await pool.query("SELECT COUNT(*) FROM rl_categories")
        if (parseInt(check.rows[0].count, 10) === 0) {
            console.log("Seeding default categories in rl_categories...")
            const defaultCats = [
                { name: "Injectable Peptides", slug: "injectable-peptides", desc: "Premium grade injectable research peptides" },
                { name: "Topical Peptides", slug: "topical-peptides", desc: "High purity topical cosmetic and tissue peptides" },
                { name: "Research Materials", slug: "research-materials", desc: "Vials, solvents, and laboratory equipment" }
            ]
            for (const cat of defaultCats) {
                await pool.query(
                    "INSERT INTO rl_categories (id, name, slug, description, is_active, sort_order) VALUES (gen_random_uuid(), $1, $2, $3, true, 0)",
                    [cat.name, cat.slug, cat.desc]
                )
            }
            console.log("Seeding complete.")
        }
    } catch (err) {
        console.error("Database initialization error:", err.message)
    }
}
initDb()

// 1. Get Categories (for storefront and admin select options)
app.get(["/store/categories", "/store/product-categories", "/admin/categories", "/admin/product-categories"], async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name, slug, description, image_url, is_active, sort_order FROM rl_categories ORDER BY sort_order ASC, name ASC")
        const categories = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            handle: row.slug,
            category_children: []
        }))
        res.status(200).json({ categories, product_categories: categories, count: categories.length })
    } catch (error) {
        console.error("Get categories error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// Helper mapping database row to HttpTypes.StoreProduct format
function mapRowToProduct(row) {
    return {
        id: row.id,
        title: row.name,
        handle: row.slug,
        price: Number(row.price),
        original_price: Number(row.original_price || row.price),
        description: row.description,
        short_description: row.short_description,
        thumbnail: row.image_url || "/assets/peptide-vial.png",
        images: [
            ...(row.image_url ? [{ id: "img_" + row.id, url: row.image_url }] : []),
            ...(Array.isArray(row.image_gallery) ? row.image_gallery.map((url, i) => ({ id: `img_gallery_${row.id}_${i}`, url })) : [])
        ],
        image_gallery: row.image_gallery || [],
        status: row.is_active ? "published" : "draft",
        weight: 10,
        dosage: row.dosage || "",
        purity: row.purity || "",
        molecular_weight: row.molecular_weight || "",
        molecular_formula: row.molecular_formula || "",
        category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
        variants: [
            {
                id: "var_" + row.id,
                sku: row.sku || "",
                title: "Single Vial",
                inventory_quantity: row.stock_quantity || 0,
                options: [],
                calculated_price: {
                    calculated_amount: Number(row.price),
                    original_amount: Number(row.original_price || row.price),
                    currency_code: "aud",
                    calculated_price: { price_list_type: null }
                }
            }
        ]
    }
}

// 2. Get Products (storefront listing and details filtering)
app.get("/store/products", async (req, res) => {
    try {
        const { handle, category_id, id } = req.query
        let queryStr = `
            SELECT p.*, c.name as category_name 
            FROM rl_products p
            LEFT JOIN rl_categories c ON p.category_id = c.id
        `
        const params = []
        let parsedId = id
        if (Array.isArray(parsedId)) {
            parsedId = parsedId[0]
        }

        let parsedCategoryId = category_id || req.query['category_id[]'] || req.query['category_id']
        if (Array.isArray(parsedCategoryId)) {
            parsedCategoryId = parsedCategoryId[0]
        }

        if (handle) {
            queryStr += " WHERE p.slug = $1"
            params.push(handle)
        } else if (parsedId) {
            queryStr += " WHERE p.id = $1"
            params.push(parsedId)
        } else if (parsedCategoryId) {
            queryStr += " WHERE p.category_id = $1"
            params.push(parsedCategoryId)
        }
        queryStr += " ORDER BY p.created_at DESC"
        
        const result = await pool.query(queryStr, params)
        const productRows = result.rows
        
        // Fetch variants for all returned products
        const productIds = productRows.map(p => p.id)
        let variantsMap = {}
        if (productIds.length > 0) {
            const varsResult = await pool.query(
                "SELECT * FROM rl_product_variants WHERE product_id = ANY($1) ORDER BY price ASC",
                [productIds]
            )
            for (const v of varsResult.rows) {
                if (!variantsMap[v.product_id]) {
                    variantsMap[v.product_id] = []
                }
                variantsMap[v.product_id].push({
                    id: v.id,
                    sku: v.sku || "",
                    title: v.title,
                    weight: v.weight || "",
                    inventory_quantity: v.stock_quantity || 0,
                    options: [],
                    calculated_price: {
                        calculated_amount: Number(v.price),
                        original_amount: Number(v.original_price || v.price),
                        currency_code: "aud",
                        calculated_price: { price_list_type: null }
                    }
                })
            }
        }

        const products = productRows.map(row => {
            const mapped = mapRowToProduct(row)
            if (variantsMap[row.id] && variantsMap[row.id].length > 0) {
                mapped.variants = variantsMap[row.id]
            }
            return mapped
        })
        
        res.status(200).json({ products, count: products.length, limit: 100, offset: 0 })
    } catch (error) {
        console.error("Get products error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

app.get("/store/products/:id", async (req, res) => {
    try {
        const { id } = req.params
        const result = await pool.query(
            `SELECT p.*, c.name as category_name 
             FROM rl_products p
             LEFT JOIN rl_categories c ON p.category_id = c.id
             WHERE p.id = $1`,
            [id]
        )
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Product not found" })
        }
        
        const row = result.rows[0]
        const mapped = mapRowToProduct(row)
        
        // Fetch variants for this product
        const varsResult = await pool.query(
            "SELECT * FROM rl_product_variants WHERE product_id = $1 ORDER BY price ASC",
            [id]
        )
        if (varsResult.rows.length > 0) {
            mapped.variants = varsResult.rows.map(v => ({
                id: v.id,
                sku: v.sku || "",
                title: v.title,
                weight: v.weight || "",
                inventory_quantity: v.stock_quantity || 0,
                options: [],
                calculated_price: {
                    calculated_amount: Number(v.price),
                    original_amount: Number(v.original_price || v.price),
                    currency_code: "aud",
                    calculated_price: { price_list_type: null }
                }
            }))
        }
        
        res.status(200).json({ product: mapped })
    } catch (error) {
        console.error("Get product by ID error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// 3. Admin: Add Product
app.post("/admin/products", async (req, res) => {
    try {
        const {
            name, slug, description, short_description, price, original_price, 
            discount_percent, image_url, sku, stock_quantity, category_id, 
            dosage, purity, molecular_weight, molecular_formula, is_active, is_featured,
            image_gallery, variants
        } = req.body

        if (!name || !price) {
            return res.status(400).json({ message: "Name and Price are required" })
        }

        const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
        
        const queryStr = `
            INSERT INTO rl_products (
                id, name, slug, description, short_description, price, original_price, 
                discount_percent, image_url, sku, stock_quantity, category_id, 
                dosage, purity, molecular_weight, molecular_formula, is_active, is_featured,
                image_gallery
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            ) RETURNING *
        `
        const values = [
            name, generatedSlug, description || "", short_description || "", 
            Number(price), original_price ? Number(original_price) : Number(price), 
            discount_percent ? parseInt(discount_percent, 10) : 0, 
            image_url || null, sku || "", 
            stock_quantity ? parseInt(stock_quantity, 10) : 0, 
            category_id || null, dosage || "", purity || "", 
            molecular_weight || "", molecular_formula || "", 
            is_active !== false, is_featured === true,
            Array.isArray(image_gallery) ? image_gallery : null
        ]

        const result = await pool.query(queryStr, values)
        const product = result.rows[0]

        // Create variants in the separate table
        if (Array.isArray(variants) && variants.length > 0) {
            for (const v of variants) {
                await pool.query(
                    `INSERT INTO rl_product_variants (product_id, title, price, original_price, sku, stock_quantity, weight)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        product.id,
                        v.title,
                        Number(v.price),
                        v.original_price ? Number(v.original_price) : null,
                        v.sku || "",
                        v.stock_quantity ? parseInt(v.stock_quantity, 10) : 0,
                        v.weight || ""
                    ]
                )
            }
        } else {
            // Default backward compatible variant
            await pool.query(
                `INSERT INTO rl_product_variants (product_id, title, price, original_price, sku, stock_quantity, weight)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    product.id,
                    "Single Vial",
                    Number(price),
                    original_price ? Number(original_price) : null,
                    sku || "",
                    stock_quantity ? parseInt(stock_quantity, 10) : 0,
                    ""
                ]
            )
        }

        res.status(201).json({ message: "Product created successfully", product })
    } catch (error) {
        console.error("Create product error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// 4. Admin: Update Product (POST & PUT)
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params
        const {
            name, slug, description, short_description, price, original_price, 
            discount_percent, image_url, sku, stock_quantity, category_id, 
            dosage, purity, molecular_weight, molecular_formula, is_active, is_featured,
            image_gallery, variants
        } = req.body

        if (!name || !price) {
            return res.status(400).json({ message: "Name and Price are required" })
        }

        const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

        const queryStr = `
            UPDATE rl_products SET
                name = $1, slug = $2, description = $3, short_description = $4,
                price = $5, original_price = $6, discount_percent = $7, image_url = $8,
                sku = $9, stock_quantity = $10, category_id = $11, dosage = $12,
                purity = $13, molecular_weight = $14, molecular_formula = $15,
                is_active = $16, is_featured = $17, image_gallery = $18, updated_at = NOW()
            WHERE id = $19 RETURNING *
        `
        const values = [
            name, generatedSlug, description || "", short_description || "", 
            Number(price), original_price ? Number(original_price) : Number(price), 
            discount_percent ? parseInt(discount_percent, 10) : 0, 
            image_url || null, sku || "", 
            stock_quantity ? parseInt(stock_quantity, 10) : 0, 
            category_id || null, dosage || "", purity || "", 
            molecular_weight || "", molecular_formula || "", 
            is_active !== false, is_featured === true,
            Array.isArray(image_gallery) ? image_gallery : null,
            id
        ]

        const result = await pool.query(queryStr, values)
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Product not found" })
        }
        const product = result.rows[0]

        // Update variants: clear existing first
        await pool.query("DELETE FROM rl_product_variants WHERE product_id = $1", [id])
        
        // Insert new variant list
        if (Array.isArray(variants) && variants.length > 0) {
            for (const v of variants) {
                await pool.query(
                    `INSERT INTO rl_product_variants (product_id, title, price, original_price, sku, stock_quantity, weight)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        id,
                        v.title,
                        Number(v.price),
                        v.original_price ? Number(v.original_price) : null,
                        v.sku || "",
                        v.stock_quantity ? parseInt(v.stock_quantity, 10) : 0,
                        v.weight || ""
                    ]
                )
            }
        } else {
            // Default backward compatible variant
            await pool.query(
                `INSERT INTO rl_product_variants (product_id, title, price, original_price, sku, stock_quantity, weight)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    id,
                    "Single Vial",
                    Number(price),
                    original_price ? Number(original_price) : null,
                    sku || "",
                    stock_quantity ? parseInt(stock_quantity, 10) : 0,
                    ""
                ]
            )
        }

        res.status(200).json({ message: "Product updated successfully", product })
    } catch (error) {
        console.error("Update product error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
}
app.post("/admin/products/:id", updateProduct)
app.put("/admin/products/:id", updateProduct)

// 5. Admin: Delete Product
app.delete("/admin/products/:id", async (req, res) => {
    try {
        const { id } = req.params
        const result = await pool.query("DELETE FROM rl_products WHERE id = $1 RETURNING *", [id])
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Product not found" })
        }
        res.status(200).json({ message: "Product deleted successfully" })
    } catch (error) {
        console.error("Delete product error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// 6. Admin: Upload Image (Base64)
app.post("/admin/upload", async (req, res) => {
    try {
        const { fileName, fileData } = req.body
        if (!fileName || !fileData) {
            return res.status(400).json({ message: "Filename and fileData are required" })
        }

        // Clean name
        const cleanName = Date.now() + "_" + fileName.replace(/[^a-zA-Z0-9.\-_]/g, "")
        const filePath = path.join(uploadsDir, cleanName)

        // Write file
        const buffer = Buffer.from(fileData, "base64")
        fs.writeFileSync(filePath, buffer)

        const protocol = req.headers["x-forwarded-proto"] || req.protocol
        const host = req.headers["x-forwarded-host"] || req.headers.host
        const fileUrl = `${protocol}://${host}/uploads/${cleanName}`
        res.status(200).json({ url: fileUrl })
    } catch (error) {
        console.error("Upload error:", error.message)
        res.status(500).json({ message: "Internal server error" })
    }
})

// ============ CART & CHECKOUT ============

// Initialize cart tables
async function initCartTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_carts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT,
                shipping_address JSONB DEFAULT '{}',
                billing_address JSONB DEFAULT '{}',
                region_id TEXT DEFAULT 'reg_au',
                currency_code TEXT DEFAULT 'aud',
                shipping_method TEXT,
                shipping_total NUMERIC(10,2) DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `)
        // Apply alterations to support legacy PostgreSQL schemas
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS email TEXT")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}'")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS billing_address JSONB DEFAULT '{}'")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS region_id TEXT DEFAULT 'reg_au'")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'aud'")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS shipping_method TEXT")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS shipping_total NUMERIC(10,2) DEFAULT 0")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS payment_method TEXT")
        await pool.query("ALTER TABLE rl_carts ADD COLUMN IF NOT EXISTS shipping_protection BOOLEAN DEFAULT false")

        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_cart_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cart_id UUID REFERENCES rl_carts(id) ON DELETE CASCADE,
                product_id UUID REFERENCES rl_products(id) ON DELETE CASCADE,
                variant_id TEXT,
                quantity INTEGER DEFAULT 1,
                unit_price NUMERIC(10,2) DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `)
        await pool.query("ALTER TABLE rl_cart_items ADD COLUMN IF NOT EXISTS variant_id TEXT")
        await pool.query("ALTER TABLE rl_cart_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) DEFAULT 0")

        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cart_id UUID,
                email TEXT,
                items JSONB DEFAULT '[]',
                subtotal NUMERIC(10,2) DEFAULT 0,
                shipping_total NUMERIC(10,2) DEFAULT 0,
                total NUMERIC(10,2) DEFAULT 0,
                status TEXT DEFAULT 'pending',
                shipping_address JSONB DEFAULT '{}',
                billing_address JSONB DEFAULT '{}',
                shipping_protection BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `)
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS cart_id UUID")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS email TEXT")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS shipping_total NUMERIC(10,2) DEFAULT 0")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}'")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS billing_address JSONB DEFAULT '{}'")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS shipping_protection BOOLEAN DEFAULT false")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT 'Standard Delivery'")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS tracking_provider TEXT")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS tracking_link TEXT")
        await pool.query("ALTER TABLE rl_orders ADD COLUMN IF NOT EXISTS private_notes JSONB DEFAULT '[]'")

        // Ensure Glycine and NMN exist in rl_products and variants
        const glycineCheck = await pool.query("SELECT * FROM rl_products WHERE slug = 'glycine'")
        if (glycineCheck.rows.length === 0) {
            const prodRes = await pool.query(
                "INSERT INTO rl_products (name, slug, description, price, original_price, image_url, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                ["Glycine", "glycine", "The sleep-and-skin amino acid your stack is missing.", 17.99, 21.99, "https://purepeptides.com.au/cdn/shop/files/Glycine.png", true]
            )
            const newProdId = prodRes.rows[0].id
            await pool.query("INSERT INTO rl_product_variants (product_id, title, price, original_price, sku) VALUES ($1, $2, $3, $4, $5)",
                [newProdId, "Single Bottle", 17.99, 21.99, "GLY-SINGLE"])
        }

        const nmnCheck = await pool.query("SELECT * FROM rl_products WHERE slug = 'nmn'")
        if (nmnCheck.rows.length === 0) {
            const prodRes = await pool.query(
                "INSERT INTO rl_products (name, slug, description, price, original_price, image_url, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                ["NMN", "nmn", "The NAD+ booster everyone's stacking for longevity.", 22.99, 28.99, "https://purepeptides.com.au/cdn/shop/files/NMN.png", true]
            )
            const newProdId = prodRes.rows[0].id
            await pool.query("INSERT INTO rl_product_variants (product_id, title, price, original_price, sku) VALUES ($1, $2, $3, $4, $5)",
                [newProdId, "Single Bottle", 22.99, 28.99, "NMN-SINGLE"])
        }

        // Ensure Add-ons/Accessories category exists
        let categoryId = null
        const catCheck = await pool.query("SELECT id FROM rl_categories WHERE name = 'Add-ons/Accessories' OR name = 'Accessories' LIMIT 1")
        if (catCheck.rows.length > 0) {
            categoryId = catCheck.rows[0].id
        } else {
            const newCat = await pool.query(
                "INSERT INTO rl_categories (id, name, slug) VALUES (gen_random_uuid(), 'Add-ons/Accessories', 'accessories') RETURNING id"
            )
            categoryId = newCat.rows[0].id
        }

        // Seeding accessories products
        const syringesCheck = await pool.query("SELECT * FROM rl_products WHERE slug = 'sterile-insulin-syringes'")
        if (syringesCheck.rows.length === 0) {
            const prodRes = await pool.query(
                "INSERT INTO rl_products (name, slug, description, price, original_price, image_url, is_active, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                ["Sterile Insulin Syringes (Pack of 10)", "sterile-insulin-syringes", "Insulin Syringes 1ml pack of 10 for mixing and administration.", 14.95, 19.95, "https://purepeptides.com.au/cdn/shop/files/Glycine.png", true, categoryId]
            )
            const newProdId = prodRes.rows[0].id
            await pool.query("INSERT INTO rl_product_variants (product_id, title, price, original_price, sku) VALUES ($1, $2, $3, $4, $5)",
                [newProdId, "Pack of 10", 14.95, 19.95, "SYRINGES-10"])
        }

        const waterCheck = await pool.query("SELECT * FROM rl_products WHERE slug = 'bacteriostatic-sterile-water'")
        if (waterCheck.rows.length === 0) {
            const prodRes = await pool.query(
                "INSERT INTO rl_products (name, slug, description, price, original_price, image_url, is_active, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                ["Bacteriostatic Sterile Water (10ml)", "bacteriostatic-sterile-water", "Sterile water 10ml containing 0.9% benzyl alcohol preservative.", 9.95, 14.95, "https://purepeptides.com.au/cdn/shop/files/Glycine.png", true, categoryId]
            )
            const newProdId = prodRes.rows[0].id
            await pool.query("INSERT INTO rl_product_variants (product_id, title, price, original_price, sku) VALUES ($1, $2, $3, $4, $5)",
                [newProdId, "10ml Bottle", 9.95, 14.95, "WATER-10"])
        }

        const wipesCheck = await pool.query("SELECT * FROM rl_products WHERE slug = 'alcohol-prep-wipes'")
        if (wipesCheck.rows.length === 0) {
            const prodRes = await pool.query(
                "INSERT INTO rl_products (name, slug, description, price, original_price, image_url, is_active, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                ["Alcohol Prep Wipes (Box of 100)", "alcohol-prep-wipes", "Alcohol prep wipes containing 70% Isopropyl Alcohol.", 6.50, 9.95, "https://purepeptides.com.au/cdn/shop/files/Glycine.png", true, categoryId]
            )
            const newProdId = prodRes.rows[0].id
            await pool.query("INSERT INTO rl_product_variants (product_id, title, price, original_price, sku) VALUES ($1, $2, $3, $4, $5)",
                [newProdId, "Box of 100", 6.50, 9.95, "WIPES-100"])
        }
    } catch (err) {
        console.error("Cart tables init error:", err.message)
    }
}
initCartTables()

// Helper: build cart response from DB
async function buildCartResponse(cartId) {
    const cartRes = await pool.query("SELECT * FROM rl_carts WHERE id = $1", [cartId])
    if (cartRes.rows.length === 0) return null
    const cart = cartRes.rows[0]

    const itemsRes = await pool.query(`
        SELECT ci.*, p.name as product_name, p.slug, p.image_url, p.price as product_price, p.original_price
        FROM rl_cart_items ci
        JOIN rl_products p ON ci.product_id = p.id
        WHERE ci.cart_id = $1
        ORDER BY ci.created_at ASC
    `, [cartId])

    const variantIds = itemsRes.rows
        .filter(row => row.variant_id && row.variant_id !== row.product_id)
        .map(row => row.variant_id)
    let variantsMap = {}
    if (variantIds.length > 0) {
        const varsRes = await pool.query("SELECT id, title FROM rl_product_variants WHERE id = ANY($1)", [variantIds])
        for (const v of varsRes.rows) {
            variantsMap[v.id] = v.title
        }
    }

    const items = itemsRes.rows.map(row => {
        const variantTitle = variantsMap[row.variant_id] || "Default"
        const fullTitle = variantTitle !== "Default" ? `${row.product_name} (${variantTitle})` : row.product_name
        return {
            id: row.id,
            title: fullTitle,
            subtitle: variantTitle !== "Default" ? variantTitle : null,
            thumbnail: row.image_url || "/assets/peptide-vial.png",
            variant_id: row.variant_id || row.product_id,
            product_id: row.product_id,
            product_handle: row.slug,
            product_title: row.product_name,
            quantity: row.quantity,
            unit_price: parseFloat(row.unit_price),
            total: parseFloat(row.unit_price) * row.quantity,
            original_total: parseFloat(row.original_price || row.unit_price) * row.quantity,
            variant: { id: row.variant_id || row.product_id, title: variantTitle },
            product: { id: row.product_id, title: row.product_name, handle: row.slug, thumbnail: row.image_url }
        }
    })

    // Fetch free shipping threshold from settings
    let threshold = 200;
    try {
        const thresholdRes = await pool.query("SELECT value FROM rl_store_settings WHERE key = 'free_shipping_threshold'")
        if (thresholdRes.rows.length > 0) {
            threshold = parseFloat(thresholdRes.rows[0].value) || 200;
        }
    } catch (e) {
        console.error("Error fetching shipping threshold setting:", e.message)
    }

    const subtotal = items.reduce((sum, i) => sum + i.total, 0)
    // Free shipping threshold
    const shippingTotal = (subtotal >= threshold && subtotal > 0) ? 0.00 : (parseFloat(cart.shipping_total) || 9.95)
    // Shipping protection cost is $6.50 if enabled
    const protectionTotal = cart.shipping_protection ? 6.50 : 0.00
    const total = subtotal + shippingTotal + protectionTotal

    return {
        id: cart.id,
        email: cart.email,
        region_id: cart.region_id,
        currency_code: cart.currency_code,
        shipping_address: cart.shipping_address,
        billing_address: cart.billing_address,
        shipping_methods: cart.shipping_method ? [{ id: "sm_" + cart.id, name: cart.shipping_method, amount: shippingTotal }] : [],
        items,
        subtotal,
        shipping_total: shippingTotal,
        tax_total: 0,
        discount_total: 0,
        total,
        item_total: subtotal,
        shipping_protection: !!cart.shipping_protection,
        shipping_protection_total: protectionTotal,
        region: { id: "reg_au", name: "Australia", currency_code: "aud", tax_rate: 0 },
        payment_collection: null
    }
}

// Create Cart
app.post("/store/carts", async (req, res) => {
    try {
        const result = await pool.query(
            "INSERT INTO rl_carts (region_id, currency_code) VALUES ($1, $2) RETURNING id",
            [req.body.region_id || "reg_au", "aud"]
        )
        const cart = await buildCartResponse(result.rows[0].id)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Create cart error:", err.message)
        res.status(500).json({ message: "Failed to create cart" })
    }
})

// Get Cart
app.get("/store/carts/:id", async (req, res) => {
    try {
        const cart = await buildCartResponse(req.params.id)
        if (!cart) return res.status(404).json({ message: "Cart not found" })
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Get cart error:", err.message)
        res.status(500).json({ message: "Failed to get cart" })
    }
})

// Update Cart (email, addresses)
app.post("/store/carts/:id", async (req, res) => {
    try {
        const { email, shipping_address, billing_address, region_id } = req.body
        const updates = []
        const values = []
        let idx = 1
        if (email) { updates.push(`email = $${idx++}`); values.push(email) }
        if (shipping_address) { updates.push(`shipping_address = $${idx++}`); values.push(JSON.stringify(shipping_address)) }
        if (billing_address) { updates.push(`billing_address = $${idx++}`); values.push(JSON.stringify(billing_address)) }
        if (region_id) { updates.push(`region_id = $${idx++}`); values.push(region_id) }
        if (updates.length > 0) {
            updates.push(`updated_at = NOW()`)
            values.push(req.params.id)
            await pool.query(`UPDATE rl_carts SET ${updates.join(", ")} WHERE id = $${idx}`, values)
        }
        const cart = await buildCartResponse(req.params.id)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Update cart error:", err.message)
        res.status(500).json({ message: "Failed to update cart" })
    }
})

// Add Line Item
app.post("/store/carts/:id/line-items", async (req, res) => {
    try {
        const { variant_id, quantity } = req.body
        
        let price = 0
        let productId = null
        let targetVariantId = null

        const knownSlugs = {
            "beef-liver-pills": { name: "Beef Liver Pills", price: 19.99, was: 24.99, desc: "Nature's multivitamin: B12, iron & folate in one tiny pill.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "glycine": { name: "Glycine", price: 17.99, was: 21.99, desc: "The sleep-and-skin amino acid your stack is missing.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "coq10": { name: "CoQ10", price: 18.99, was: 23.99, desc: "Mitochondrial fuel for energy that actually lasts.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "nmn": { name: "NMN", price: 22.99, was: 28.99, desc: "The NAD+ booster everyone's stacking for longevity.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "protein-creatine-gummies": { name: "Protein + Creatine Gummies", price: 16.99, was: 19.99, desc: "Gains in gummy form. No shaker, no excuses.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "l-reuteri": { name: "L. Reuteri (Probiotic)", price: 20.99, was: 25.99, desc: "Gut health meets feel-good hormones.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "sterile-insulin-syringes": { name: "Sterile Insulin Syringes (Pack of 10)", price: 14.95, was: 19.95, desc: "Insulin Syringes 1ml pack of 10 for mixing and administration.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "bacteriostatic-sterile-water": { name: "Bacteriostatic Sterile Water (10ml)", price: 9.95, was: 14.95, desc: "Sterile water 10ml containing 0.9% benzyl alcohol preservative.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" },
            "alcohol-prep-wipes": { name: "Alcohol Prep Wipes (Box of 100)", price: 6.50, was: 9.95, desc: "Alcohol prep wipes containing 70% Isopropyl Alcohol.", img: "https://purepeptides.com.au/cdn/shop/files/Glycine.png" }
        }

        const cleanVariantId = typeof variant_id === "string" ? variant_id.replace(/^var_/, "") : variant_id
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanVariantId)
        
        if (isUuid) {
            // 1. Check if variant_id exists in rl_product_variants
            const variantCheck = await pool.query("SELECT * FROM rl_product_variants WHERE id = $1", [cleanVariantId])
            if (variantCheck.rows.length > 0) {
                const variant = variantCheck.rows[0]
                price = Number(variant.price)
                productId = variant.product_id
                targetVariantId = variant.id
            } else {
                // 2. Fall back to checking if it is a product_id
                const product = await pool.query("SELECT price FROM rl_products WHERE id = $1", [cleanVariantId])
                if (product.rows.length > 0) {
                    productId = cleanVariantId
                    price = Number(product.rows[0].price)
                    const varCheck = await pool.query("SELECT id FROM rl_product_variants WHERE product_id = $1 LIMIT 1", [cleanVariantId])
                    targetVariantId = varCheck.rows[0]?.id || cleanVariantId
                }
            }
        } else if (knownSlugs[cleanVariantId]) {
            const slug = cleanVariantId
            const check = await pool.query("SELECT id, price FROM rl_products WHERE slug = $1", [slug])
            if (check.rows.length > 0) {
                productId = check.rows[0].id
                price = Number(check.rows[0].price)
                const varCheck = await pool.query("SELECT id FROM rl_product_variants WHERE product_id = $1 LIMIT 1", [productId])
                targetVariantId = varCheck.rows[0]?.id || check.rows[0].id
            } else {
                // Create it on the fly!
                const info = knownSlugs[slug]
                const prodRes = await pool.query(
                    "INSERT INTO rl_products (id, name, slug, description, price, original_price, image_url, is_active) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING id",
                    [info.name, slug, info.desc, info.price, info.was, info.img, true]
                )
                const newProdId = prodRes.rows[0].id
                const varRes = await pool.query(
                    "INSERT INTO rl_product_variants (id, product_id, title, price, original_price, sku) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id",
                    [newProdId, "Single Bottle", info.price, info.was, slug.toUpperCase() + "-SINGLE"]
                )
                productId = newProdId
                price = info.price
                targetVariantId = varRes.rows[0].id
            }
        }
        
        // If the ID is not in the DB and not a known slug, fallback to the first active database product
        if (!productId) {
            const firstProduct = await pool.query("SELECT id, price FROM rl_products WHERE is_active = true LIMIT 1")
            if (firstProduct.rows.length > 0) {
                productId = firstProduct.rows[0].id
                price = Number(firstProduct.rows[0].price)
                const varCheck = await pool.query("SELECT id FROM rl_product_variants WHERE product_id = $1 LIMIT 1", [productId])
                targetVariantId = varCheck.rows[0]?.id || productId
            } else {
                return res.status(404).json({ message: "No active products found in database" })
            }
        }

        if (!targetVariantId) {
            targetVariantId = cleanVariantId
        }

        // Check if item already exists in cart with this specific variant/product ID
        const existing = await pool.query(
            "SELECT id, quantity FROM rl_cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id = $3",
            [req.params.id, productId, targetVariantId]
        )
        if (existing.rows.length > 0) {
            await pool.query(
                "UPDATE rl_cart_items SET quantity = quantity + $1 WHERE id = $2",
                [quantity || 1, existing.rows[0].id]
            )
        } else {
            await pool.query(
                "INSERT INTO rl_cart_items (cart_id, product_id, variant_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)",
                [req.params.id, productId, targetVariantId, quantity || 1, price]
            )
        }
        const cart = await buildCartResponse(req.params.id)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Add line item error:", err.message)
        res.status(500).json({ message: "Failed to add item" })
    }
})

// Update Line Item
app.post("/store/carts/:cartId/line-items/:lineId", async (req, res) => {
    try {
        const { quantity } = req.body
        await pool.query("UPDATE rl_cart_items SET quantity = $1 WHERE id = $2 AND cart_id = $3",
            [quantity, req.params.lineId, req.params.cartId])
        const cart = await buildCartResponse(req.params.cartId)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Update line item error:", err.message)
        res.status(500).json({ message: "Failed to update item" })
    }
})

// Delete Line Item
app.delete("/store/carts/:cartId/line-items/:lineId", async (req, res) => {
    try {
        await pool.query("DELETE FROM rl_cart_items WHERE id = $1 AND cart_id = $2",
            [req.params.lineId, req.params.cartId])
        const cart = await buildCartResponse(req.params.cartId)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Delete line item error:", err.message)
        res.status(500).json({ message: "Failed to delete item" })
    }
})

// Shipping Methods
app.get("/store/shipping-options", async (req, res) => {
    res.status(200).json({
        shipping_options: [
            { id: "so_standard", name: "Standard Shipping", amount: 995, price_type: "flat_rate", service_zone: { id: "sz_au" } },
            { id: "so_express", name: "Express Shipping", amount: 1995, price_type: "flat_rate", service_zone: { id: "sz_au" } }
        ]
    })
})

app.post("/store/carts/:id/shipping-methods", async (req, res) => {
    try {
        const { option_id } = req.body
        const shippingCost = option_id === "so_express" ? 19.95 : 9.95
        const shippingName = option_id === "so_express" ? "Express Shipping" : "Standard Shipping"
        await pool.query("UPDATE rl_carts SET shipping_method = $1, shipping_total = $2, updated_at = NOW() WHERE id = $3",
            [shippingName, shippingCost, req.params.id])
        const cart = await buildCartResponse(req.params.id)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Set shipping error:", err.message)
        res.status(500).json({ message: "Failed to set shipping" })
    }
})

// Payment Collections
app.post("/store/payment-collections/:id/payment-sessions", async (req, res) => {
    try {
        const { provider_id } = req.body
        await pool.query("UPDATE rl_carts SET payment_method = $1 WHERE id = $2", [provider_id || "manual", req.params.id])
        res.status(200).json({
            payment_collection: {
                id: req.params.id,
                payment_sessions: [{ id: "ps_" + (provider_id || "manual"), provider_id: provider_id || "manual", status: "pending" }]
            }
        })
    } catch (err) {
        console.error("Save payment session error:", err.message)
        res.status(500).json({ message: "Failed to set payment session" })
    }
})

app.get("/store/payment-providers", async (req, res) => {
    res.status(200).json({
        payment_providers: [
            { id: "manual", is_enabled: true },
            { id: "paytree", is_enabled: true }
        ]
    })
})

// Complete Cart (Checkout)
app.post("/store/carts/:id/complete", async (req, res) => {
    try {
        const cart = await buildCartResponse(req.params.id)
        if (!cart) return res.status(404).json({ message: "Cart not found" })

        const cartDbRes = await pool.query("SELECT payment_method, shipping_protection FROM rl_carts WHERE id = $1", [req.params.id])
        const paymentMethod = cartDbRes.rows[0]?.payment_method || "manual"
        const shippingProtection = !!cartDbRes.rows[0]?.shipping_protection

        if (paymentMethod === "paytree") {
            const PAYTREE_API_TOKEN = process.env.PAYTREE_API_TOKEN || "95868f612d9b87b59f9dc4c6ef3cfe7be32001e1"
            let PAYTREE_API_URL = process.env.PAYTREE_API_URL || "https://app.secured-checkout.com/api"
            if (PAYTREE_API_URL.endsWith("secured-checkout.com")) {
                PAYTREE_API_URL += "/api"
            } else if (PAYTREE_API_URL.endsWith("secured-checkout.com/")) {
                PAYTREE_API_URL = PAYTREE_API_URL.slice(0, -1) + "/api"
            }
            
            const host = req.headers.host || "rl.eezzymart.tech"
            const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
            const PAYTREE_CALLBACK_URL = process.env.PAYTREE_CALLBACK_URL || `${protocol}://${host}/store/paytree-callback`

            // Clean up any previous pending order for this cart to prevent duplicates
            await pool.query("DELETE FROM rl_orders WHERE cart_id = $1 AND status = 'pending'", [cart.id])

            // Build correct Paytree payload
            const payload = {
                transaction_ref: `${cart.id}_${Date.now()}`,
                client_ref: cart.email,
                amount: cart.total.toFixed(2),
                amount_currency: cart.currency_code.toUpperCase(),
                method: "card",
                customer: {
                    first_name: cart.shipping_address?.first_name || "Guest",
                    last_name: cart.shipping_address?.last_name || "Customer",
                    email: cart.email,
                    phone: cart.shipping_address?.phone || ""
                },
                address: {
                    street: cart.shipping_address?.address_1 || "",
                    city: cart.shipping_address?.city || "",
                    state: cart.shipping_address?.province || "",
                    zip: cart.shipping_address?.postal_code || "",
                    country: (cart.shipping_address?.country_code || "au").toLowerCase()
                },
                session: {
                    ip_address: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
                    user_agent: req.headers["user-agent"] || "Mozilla/5.0"
                },
                callback: {
                    notification_url: `${PAYTREE_CALLBACK_URL}?payment_intent_id={payment_intent_id}&transaction_id={transaction_id}`,
                    return_url: `${PAYTREE_CALLBACK_URL}?payment_intent_id={payment_intent_id}&transaction_id={transaction_id}`
                }
            }

            // Call Paytree API to initiate payment session
            const paytreeResponse = await fetch(`${PAYTREE_API_URL}/v1/transaction/payment_intent/`, {
                method: "POST",
                headers: {
                    "Authorization": `Token ${PAYTREE_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })

            if (!paytreeResponse.ok) {
                const errText = await paytreeResponse.text()
                console.error("Paytree API error response:", errText)
                return res.status(400).json({ message: "Failed to initiate payment gateway." })
            }

            const paytreeData = await paytreeResponse.json()
            const checkoutUrl = paytreeData.payment_link || paytreeData.checkout_url || paytreeData.payment_url

            // Insert a pending order to record it in our database
            await pool.query(
                "INSERT INTO rl_orders (cart_id, email, items, subtotal, shipping_total, total, status, payment_status, shipping_address, billing_address, order_number, payment_method, shipping_protection) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
                [cart.id, cart.email, JSON.stringify(cart.items), cart.subtotal, cart.shipping_total, cart.total, "pending", "awaiting_payment", JSON.stringify(cart.shipping_address), JSON.stringify(cart.billing_address || {}), "ORD-" + Date.now(), "paytree", shippingProtection]
            )

            return res.status(200).json({
                type: "paytree_redirect",
                checkout_url: checkoutUrl
            })
        }

        const orderInsertRes = await pool.query(
            "INSERT INTO rl_orders (cart_id, email, items, subtotal, shipping_total, total, status, shipping_address, billing_address, order_number, payment_method, shipping_protection) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [cart.id, cart.email, JSON.stringify(cart.items), cart.subtotal, cart.shipping_total, cart.total, "confirmed", JSON.stringify(cart.shipping_address), JSON.stringify(cart.billing_address || {}), "ORD-" + Date.now(), paymentMethod, shippingProtection]
        )
        const newOrder = orderInsertRes.rows[0]

        // Clear cart items
        await pool.query("DELETE FROM rl_cart_items WHERE cart_id = $1", [req.params.id])

        res.status(200).json({
            type: "order",
            order: {
                id: newOrder.id,
                status: "confirmed",
                items: cart.items,
                subtotal: cart.subtotal,
                shipping_total: cart.shipping_total,
                total: cart.total,
                email: cart.email
            }
        })
    } catch (err) {
        console.error("Complete cart error:", err.message)
        res.status(500).json({ message: "Failed to complete checkout" })
    }
})

// Paytree Callback verification handler
app.get("/store/paytree-callback", async (req, res) => {
    try {
        const { payment_intent_id, transaction_id } = req.query
        if (!payment_intent_id) {
            return res.status(400).send("Missing payment_intent_id")
        }

        const PAYTREE_API_TOKEN = process.env.PAYTREE_API_TOKEN || "95868f612d9b87b59f9dc4c6ef3cfe7be32001e1"
        const PAYTREE_API_URL = process.env.PAYTREE_API_URL || "https://app.secured-checkout.com"

        // Verify status with Paytree API
        const verifyRes = await fetch(`${PAYTREE_API_URL}/v1/transaction/payment/${payment_intent_id}/`, {
            method: "GET",
            headers: {
                "Authorization": `Token ${PAYTREE_API_TOKEN}`
            }
        })

        if (!verifyRes.ok) {
            console.error("Paytree verification request failed:", await verifyRes.text())
            return res.status(400).send("Verification request failed")
        }

        const verifyData = await verifyRes.json()
        const status = verifyData.status
        const rawCartId = verifyData.transaction_ref
        const cartId = rawCartId && rawCartId.includes("_") ? rawCartId.split("_")[0] : rawCartId

        if (status === "success" && cartId) {
            // Find the pending order for this cart
            const orderRes = await pool.query("SELECT id, shipping_address FROM rl_orders WHERE cart_id::text = $1 AND status = 'pending'", [cartId])
            if (orderRes.rows.length > 0) {
                const order = orderRes.rows[0]
                
                // Update order to confirmed and payment_status to paid
                await pool.query(
                    "UPDATE rl_orders SET status = 'confirmed', payment_status = 'paid' WHERE id = $1",
                    [order.id]
                )

                // Clear cart items
                await pool.query("DELETE FROM rl_cart_items WHERE cart_id = $1", [cartId])

                let countryCode = "au"
                try {
                    const shippingAddr = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address
                    if (shippingAddr?.country_code) {
                        countryCode = shippingAddr.country_code.toLowerCase()
                    }
                } catch (e) {
                    console.error("Failed to parse shipping address for country redirect:", e)
                }

                // If it's a browser request, redirect to confirmation page
                const isBrowser = req.headers.accept && req.headers.accept.includes("text/html")
                if (isBrowser) {
                    const frontendBase = process.env.STORE_CORS ? process.env.STORE_CORS.split(",")[0] : "https://rl-australia.vercel.app"
                    return res.redirect(`${frontendBase}/${countryCode}/order/${order.id}/confirmed?clear_cart=true`)
                } else {
                    return res.status(200).send("OK")
                }
            } else {
                return res.status(404).send("Pending order not found for this cart reference")
            }
        } else {
            return res.status(400).send(`Payment status verification is: ${status}`)
        }
    } catch (err) {
        console.error("Paytree verification callback error:", err)
        res.status(500).send("Internal server verification error")
    }
})

// Set Shipping Protection
app.post("/store/carts/:id/shipping-protection", async (req, res) => {
    try {
        const { enabled } = req.body
        await pool.query("UPDATE rl_carts SET shipping_protection = $1, updated_at = NOW() WHERE id = $2",
            [!!enabled, req.params.id])
        const cart = await buildCartResponse(req.params.id)
        res.status(200).json({ cart })
    } catch (err) {
        console.error("Set shipping protection error:", err.message)
        res.status(500).json({ message: "Failed to update shipping protection" })
    }
})

// Get Order by ID
app.get("/store/orders/:id", async (req, res) => {
    try {
        let orderRes = await pool.query("SELECT * FROM rl_orders WHERE id::text = $1 OR order_number = $2 OR tracking_number = $2", [req.params.id, req.params.id])
        if (orderRes.rows.length === 0) {
            orderRes = await pool.query("SELECT * FROM rl_orders WHERE cart_id::text = $1", [req.params.id])
        }
        if (orderRes.rows.length === 0) {
            return res.status(404).json({ message: "Order not found" })
        }
        const o = orderRes.rows[0]
        res.status(200).json({
            order: {
                id: o.id,
                order_number: o.order_number,
                cart_id: o.cart_id,
                email: o.email,
                items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
                subtotal: parseFloat(o.subtotal),
                item_subtotal: parseFloat(o.subtotal),
                shipping_total: parseFloat(o.shipping_total),
                shipping_subtotal: parseFloat(o.shipping_total),
                discount_subtotal: 0,
                tax_total: 0,
                total: parseFloat(o.total),
                status: o.status,
                payment_status: o.payment_status || "pending",
                shipping_method: o.shipping_method || "Standard Delivery",
                tracking_number: o.tracking_number || null,
                tracking_provider: o.tracking_provider || null,
                tracking_link: o.tracking_link || null,
                private_notes: typeof o.private_notes === "string" ? JSON.parse(o.private_notes) : (o.private_notes || []),
                shipping_address: typeof o.shipping_address === "string" ? JSON.parse(o.shipping_address) : o.shipping_address,
                billing_address: typeof o.billing_address === "string" ? JSON.parse(o.billing_address) : o.billing_address,
                shipping_methods: [
                    {
                        id: "sm_" + o.id,
                        name: o.shipping_method || "Standard Delivery",
                        amount: parseFloat(o.shipping_total),
                        total: parseFloat(o.shipping_total)
                    }
                ],
                payment_collections: [
                    {
                        id: "paycol_" + o.id,
                        payments: [
                            {
                                id: "pay_" + o.id,
                                provider_id: o.payment_method || "manual",
                                amount: parseFloat(o.total),
                                created_at: o.created_at
                            }
                        ]
                    }
                ],
                created_at: o.created_at,
                currency_code: "aud"
            }
        })
    } catch (err) {
        console.error("Get order error:", err.message)
        res.status(500).json({ message: "Failed to fetch order" })
    }
})

// List Orders
app.get("/store/orders", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM rl_orders ORDER BY created_at DESC")
        const orders = result.rows.map(o => ({
            id: o.id,
            order_number: o.order_number,
            cart_id: o.cart_id,
            email: o.email,
            items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
            subtotal: parseFloat(o.subtotal),
            item_subtotal: parseFloat(o.subtotal),
            shipping_total: parseFloat(o.shipping_total),
            shipping_subtotal: parseFloat(o.shipping_total),
            discount_subtotal: 0,
            tax_total: 0,
            total: parseFloat(o.total),
            status: o.status,
            payment_status: o.payment_status || "pending",
            shipping_method: o.shipping_method || "Standard Delivery",
            tracking_number: o.tracking_number || null,
            tracking_provider: o.tracking_provider || null,
            tracking_link: o.tracking_link || null,
            private_notes: typeof o.private_notes === "string" ? JSON.parse(o.private_notes) : (o.private_notes || []),
            shipping_address: typeof o.shipping_address === "string" ? JSON.parse(o.shipping_address) : o.shipping_address,
            billing_address: typeof o.billing_address === "string" ? JSON.parse(o.billing_address) : o.billing_address,
            shipping_methods: [
                {
                    id: "sm_" + o.id,
                    name: o.shipping_method || "Standard Delivery",
                    amount: parseFloat(o.shipping_total),
                    total: parseFloat(o.shipping_total)
                }
            ],
            payment_collections: [
                {
                    id: "paycol_" + o.id,
                    payments: [
                        {
                            id: "pay_" + o.id,
                            provider_id: o.payment_method || "manual",
                            amount: parseFloat(o.total),
                            created_at: o.created_at
                        }
                    ]
                }
            ],
            created_at: o.created_at,
            currency_code: "aud"
        }))
        res.status(200).json({ orders, count: orders.length })
    } catch (err) {
        console.error("List orders error:", err.message)
        res.status(500).json({ message: "Failed to fetch orders" })
    }
})

// Update Order Status and parameters
app.post("/admin/orders/:id/status", async (req, res) => {
    try {
        const { status, payment_status, shipping_method, tracking_number } = req.body
        const updates = []
        const values = []
        let idx = 1
        if (status) { updates.push(`status = $${idx++}`); values.push(status) }
        if (payment_status) { updates.push(`payment_status = $${idx++}`); values.push(payment_status) }
        if (shipping_method) { updates.push(`shipping_method = $${idx++}`); values.push(shipping_method) }
        if (tracking_number !== undefined) { updates.push(`tracking_number = $${idx++}`); values.push(tracking_number) }
        
        if (updates.length > 0) {
            values.push(req.params.id)
            await pool.query(`UPDATE rl_orders SET ${updates.join(", ")} WHERE id = $${idx}`, values)
        }
        res.status(200).json({ message: "Order updated successfully" })
    } catch (err) {
        console.error("Update order status error:", err.message)
        res.status(500).json({ message: "Failed to update order status" })
    }
})

// Update Order Tracking Details
app.post("/admin/orders/:id/tracking", async (req, res) => {
    try {
        const { tracking_number, tracking_provider, tracking_link } = req.body
        await pool.query(
            "UPDATE rl_orders SET tracking_number = $1, tracking_provider = $2, tracking_link = $3 WHERE id = $4",
            [tracking_number || null, tracking_provider || null, tracking_link || null, req.params.id]
        )
        res.status(200).json({ message: "Tracking information updated successfully" })
    } catch (err) {
        console.error("Update tracking error:", err.message)
        res.status(500).json({ message: "Failed to update tracking information" })
    }
})

// Add Order Private Note
app.post("/admin/orders/:id/note", async (req, res) => {
    try {
        const { note } = req.body
        if (!note) return res.status(400).json({ message: "Note text is required" })
        const noteObj = {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
            text: note,
            created_at: new Date().toISOString()
        }
        await pool.query(
            "UPDATE rl_orders SET private_notes = COALESCE(private_notes, '[]'::jsonb) || $1::jsonb WHERE id = $2",
            [JSON.stringify([noteObj]), req.params.id]
        )
        res.status(200).json({ message: "Note added successfully", note: noteObj })
    } catch (err) {
        console.error("Add note error:", err.message)
        res.status(500).json({ message: "Failed to add note" })
    }
})

// ============ CATEGORY CRUD ============

// Create Category
const createCategory = async (req, res) => {
    try {
        const { name, slug, description } = req.body
        if (!name) return res.status(400).json({ message: "Category name is required" })
        const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
        const result = await pool.query(
            "INSERT INTO rl_categories (id, name, slug, description, is_active, sort_order) VALUES (gen_random_uuid(), $1, $2, $3, true, 0) RETURNING *",
            [name, generatedSlug, description || ""]
        )
        res.status(201).json({ category: result.rows[0], product_category: { id: result.rows[0].id, name: result.rows[0].name, handle: result.rows[0].slug } })
    } catch (err) {
        console.error("Create category error:", err.message)
        res.status(500).json({ message: "Failed to create category" })
    }
}
app.post("/admin/categories", createCategory)
app.post("/admin/product-categories", createCategory)

// Update Category (POST & PUT)
const updateCategory = async (req, res) => {
    try {
        const { name, slug, description } = req.body
        if (!name) return res.status(400).json({ message: "Category name is required" })
        const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
        const result = await pool.query(
            "UPDATE rl_categories SET name = $1, slug = $2, description = $3 WHERE id = $4 RETURNING *",
            [name, generatedSlug, description || "", req.params.id]
        )
        if (result.rows.length === 0) return res.status(404).json({ message: "Category not found" })
        res.status(200).json({ category: result.rows[0], product_category: { id: result.rows[0].id, name: result.rows[0].name, handle: result.rows[0].slug } })
    } catch (err) {
        console.error("Update category error:", err.message)
        res.status(500).json({ message: "Failed to update category" })
    }
}
app.post("/admin/categories/:id", updateCategory)
app.post("/admin/product-categories/:id", updateCategory)
app.put("/admin/categories/:id", updateCategory)
app.put("/admin/product-categories/:id", updateCategory)

// Delete Category
const deleteCategory = async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM rl_categories WHERE id = $1 RETURNING *", [req.params.id])
        if (result.rows.length === 0) return res.status(404).json({ message: "Category not found" })
        res.status(200).json({ message: "Category deleted" })
    } catch (err) {
        console.error("Delete category error:", err.message)
        res.status(500).json({ message: "Failed to delete category" })
    }
}
app.delete("/admin/categories/:id", deleteCategory)
app.delete("/admin/product-categories/:id", deleteCategory)

// ============ STACK BUILDER / QUIZ OPTIONS ============

// Initialize recommendations table
async function initRecommendationsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_recommendations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                icon TEXT DEFAULT 'Heart',
                goal_name TEXT NOT NULL UNIQUE,
                description TEXT DEFAULT '',
                product_ids JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `)
    } catch (err) {
        console.error("Error creating recommendations table:", err.message)
    }
}
initRecommendationsTable()

// GET /store/recommendations - List all quiz options with products (public)
app.get("/store/recommendations", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM rl_recommendations ORDER BY created_at ASC")
        const recommendations = await Promise.all(
            result.rows.map(async (rec) => {
                const productIds = rec.product_ids || []
                let products = []
                if (productIds.length > 0) {
                    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",")
                    const prodResult = await pool.query(
                        `SELECT * FROM rl_products WHERE id::text IN (${placeholders})`,
                        productIds
                    )
                    products = prodResult.rows.map(mapRowToProduct)
                }
                return {
                    id: rec.id,
                    icon: rec.icon || "Heart",
                    goal_name: rec.goal_name,
                    description: rec.description || "",
                    product_ids: productIds,
                    products,
                }
            })
        )
        res.json({ recommendations, goals: recommendations })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to fetch recommendations" })
    }
})

// POST /store/recommendations - Create a new quiz option
app.post("/store/recommendations", async (req, res) => {
    try {
        const { icon, goal_name, description, product_ids } = req.body
        if (!goal_name) {
            return res.status(400).json({ message: "goal_name is required" })
        }
        const result = await pool.query(
            `INSERT INTO rl_recommendations (icon, goal_name, description, product_ids)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [icon || "Heart", goal_name, description || "", JSON.stringify(product_ids || [])]
        )
        res.status(201).json({ goal: result.rows[0] })
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ message: "A quiz option with this name already exists" })
        }
        res.status(500).json({ message: err.message || "Failed to create quiz option" })
    }
})

// POST /store/recommendations/:id - Update a quiz option
app.post("/store/recommendations/:id", async (req, res) => {
    try {
        const { id } = req.params
        const { icon, goal_name, description, product_ids } = req.body
        const result = await pool.query(
            `UPDATE rl_recommendations SET icon = COALESCE($1, icon), goal_name = COALESCE($2, goal_name), description = COALESCE($3, description), product_ids = COALESCE($4, product_ids), updated_at = NOW() WHERE id = $5 RETURNING *`,
            [icon, goal_name, description, product_ids ? JSON.stringify(product_ids) : null, id]
        )
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Quiz option not found" })
        }
        res.json({ goal: result.rows[0] })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to update quiz option" })
    }
})

// DELETE /store/recommendations/:id - Delete a quiz option
app.delete("/store/recommendations/:id", async (req, res) => {
    try {
        const { id } = req.params
        await pool.query("DELETE FROM rl_recommendations WHERE id = $1", [id])
        res.json({ message: "Deleted successfully" })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to delete quiz option" })
    }
})

// ============ QUIZ QUESTIONS & RECOMMENDATIONS ============

// Initialize quiz questions table
async function initQuizQuestionsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_quiz_questions (
                id TEXT PRIMARY KEY,
                question_text TEXT NOT NULL,
                order_number INTEGER DEFAULT 0,
                image_url TEXT DEFAULT NULL,
                options JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `)
    } catch (err) {
        console.error("Error creating quiz questions table:", err.message)
    }
}
initQuizQuestionsTable()

// GET /store/quiz - List all quiz questions (public)
app.get("/store/quiz", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM rl_quiz_questions ORDER BY order_number ASC")
        res.json({ questions: result.rows })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to fetch quiz questions" })
    }
})

// POST /store/quiz - Create a new quiz question (admin only)
app.post("/store/quiz", async (req, res) => {
    try {
        const { question_text, order_number, image_url, options } = req.body
        if (!question_text) {
            return res.status(400).json({ message: "question_text is required" })
        }
        const id = "q_" + Math.random().toString(36).slice(2)
        const result = await pool.query(
            `INSERT INTO rl_quiz_questions (id, question_text, order_number, image_url, options)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id, question_text, Number(order_number) || 0, image_url || null, JSON.stringify(options || [])]
        )
        res.status(201).json({ question: result.rows[0] })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to create quiz question" })
    }
})

// POST /store/quiz/:id - Update an existing quiz question (admin only)
app.post("/store/quiz/:id", async (req, res) => {
    try {
        const { id } = req.params
        const { question_text, order_number, image_url, options } = req.body
        
        const updates = []
        const values = []
        let idx = 1
        
        if (question_text !== undefined) { updates.push(`question_text = $${idx++}`); values.push(question_text) }
        if (order_number !== undefined) { updates.push(`order_number = $${idx++}`); values.push(Number(order_number)) }
        if (image_url !== undefined) { updates.push(`image_url = $${idx++}`); values.push(image_url) }
        if (options !== undefined) { updates.push(`options = $${idx++}`); values.push(JSON.stringify(options)) }
        
        if (updates.length === 0) {
            return res.status(400).json({ message: "No fields to update" })
        }
        
        updates.push(`updated_at = NOW()`)
        values.push(id)
        
        const queryText = `UPDATE rl_quiz_questions SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`
        const result = await pool.query(queryText, values)
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Quiz question not found" })
        }
        res.json({ question: result.rows[0] })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to update quiz question" })
    }
})

// DELETE /store/quiz/:id - Delete a quiz question (admin only)
app.delete("/store/quiz/:id", async (req, res) => {
    try {
        const { id } = req.params
        await pool.query("DELETE FROM rl_quiz_questions WHERE id = $1", [id])
        res.json({ message: "Deleted successfully" })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to delete quiz question" })
    }
})

// GET /store/quiz/recommendations - Get recommended products by ID (public)
app.get("/store/quiz/recommendations", async (req, res) => {
    try {
        const idsParam = req.query.product_ids
        if (!idsParam) {
            return res.json({ products: [] })
        }
        const productIds = idsParam.split(",").filter(Boolean)
        if (productIds.length === 0) {
            return res.json({ products: [] })
        }
        
        const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",")
        
        const prodResult = await pool.query(
            `SELECT p.*, c.name as category_name 
             FROM rl_products p 
             LEFT JOIN rl_categories c ON p.category_id = c.id 
             WHERE p.id::text IN (${placeholders})`,
            productIds
        )
        
        const products = await Promise.all(
            prodResult.rows.map(async (row) => {
                const variantsResult = await pool.query(
                    "SELECT * FROM rl_product_variants WHERE product_id = $1 ORDER BY price ASC",
                    [row.id]
                )
                
                const baseProduct = mapRowToProduct(row)
                if (variantsResult.rows.length > 0) {
                    baseProduct.variants = variantsResult.rows.map(v => ({
                        id: v.id,
                        sku: v.sku || "",
                        title: v.title,
                        price: Number(v.price),
                        original_price: Number(v.original_price || v.price),
                        calculated_price: {
                            calculated_amount: Number(v.price),
                            original_amount: Number(v.original_price || v.price),
                            currency_code: "aud",
                            calculated_price: { price_list_type: null }
                        }
                    }))
                }
                return baseProduct
            })
        )
        
        res.json({ products })
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to fetch quiz recommendations" })
    }
})


// ============ STORE SETTINGS (Dynamic Configuration) ============

// Initialize settings table
async function initSettingsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rl_store_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `)
        // Seed default free shipping threshold if not exists
        await pool.query(`
            INSERT INTO rl_store_settings (key, value) VALUES ('free_shipping_threshold', '200')
            ON CONFLICT (key) DO NOTHING
        `)
    } catch (err) {
        console.error("Error creating settings table:", err.message)
    }
}
initSettingsTable()

// GET /store/settings - Get all store settings (public)
app.get("/store/settings", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM rl_store_settings")
        const settings = {}
        result.rows.forEach(row => { settings[row.key] = row.value })
        res.json({ settings })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

// POST /store/settings - Update a setting
app.post("/store/settings", async (req, res) => {
    try {
        const { key, value } = req.body
        if (!key) return res.status(400).json({ message: "key is required" })
        await pool.query(
            `INSERT INTO rl_store_settings (key, value, updated_at) VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, String(value)]
        )
        res.json({ message: "Setting updated", key, value })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

// ============ START ============

app.listen(PORT, () => {
    console.log(`✓ RL Australia API running on http://localhost:${PORT}`)
    console.log(`  - POST /store/auth/register`)
    console.log(`  - POST /store/auth/login`)
    console.log(`  - GET  /store/auth/me`)
    console.log(`  - GET  /health`)
    console.log(`  - POST /store/carts`)
    console.log(`  - POST /admin/categories`)
})
