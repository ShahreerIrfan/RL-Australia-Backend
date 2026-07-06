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
        const { handle, category_id } = req.query
        let queryStr = `
            SELECT p.*, c.name as category_name 
            FROM rl_products p
            LEFT JOIN rl_categories c ON p.category_id = c.id
        `
        const params = []
        if (handle) {
            queryStr += " WHERE p.slug = $1"
            params.push(handle)
        } else if (category_id) {
            queryStr += " WHERE p.category_id = $1"
            params.push(category_id)
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
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `)
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

    const variantIds = itemsRes.rows.map(row => row.variant_id).filter(id => id && id !== row.product_id)
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

    const subtotal = items.reduce((sum, i) => sum + i.total, 0)
    const shippingTotal = parseFloat(cart.shipping_total) || 0
    const total = subtotal + shippingTotal

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
        
        // 1. Check if variant_id exists in rl_product_variants
        const variantCheck = await pool.query("SELECT * FROM rl_product_variants WHERE id = $1", [variant_id])
        if (variantCheck.rows.length > 0) {
            const variant = variantCheck.rows[0]
            price = Number(variant.price)
            productId = variant.product_id
        } else {
            // 2. Fall back to product_id
            productId = variant_id
            const product = await pool.query("SELECT price FROM rl_products WHERE id = $1", [productId])
            if (product.rows.length === 0) return res.status(404).json({ message: "Product not found" })
            price = Number(product.rows[0].price)
        }

        // Check if item already exists in cart with this specific variant ID
        const existing = await pool.query(
            "SELECT id, quantity FROM rl_cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id = $3",
            [req.params.id, productId, variant_id]
        )
        if (existing.rows.length > 0) {
            await pool.query(
                "UPDATE rl_cart_items SET quantity = quantity + $1 WHERE id = $2",
                [quantity || 1, existing.rows[0].id]
            )
        } else {
            await pool.query(
                "INSERT INTO rl_cart_items (cart_id, product_id, variant_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)",
                [req.params.id, productId, variant_id, quantity || 1, price]
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
    res.status(200).json({
        payment_collection: {
            id: req.params.id,
            payment_sessions: [{ id: "ps_mock", provider_id: "manual", status: "pending" }]
        }
    })
})

app.get("/store/payment-providers", async (req, res) => {
    res.status(200).json({
        payment_providers: [{ id: "manual", is_enabled: true }]
    })
})

// Complete Cart (Checkout)
app.post("/store/carts/:id/complete", async (req, res) => {
    try {
        const cart = await buildCartResponse(req.params.id)
        if (!cart) return res.status(404).json({ message: "Cart not found" })

        await pool.query(
            "INSERT INTO rl_orders (cart_id, email, items, subtotal, shipping_total, total, status, shipping_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [cart.id, cart.email, JSON.stringify(cart.items), cart.subtotal, cart.shipping_total, cart.total, "confirmed", JSON.stringify(cart.shipping_address)]
        )

        // Clear cart items
        await pool.query("DELETE FROM rl_cart_items WHERE cart_id = $1", [req.params.id])

        res.status(200).json({
            type: "order",
            order: {
                id: "order_" + Date.now(),
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
