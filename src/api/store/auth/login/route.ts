import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import pool from "../../../lib/db"
import { hashPassword, generateToken } from "../../../lib/auth"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { email, password } = req.body as any

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" })
    }

    // Check if admin login
    if (
      email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase() &&
      password === process.env.ADMIN_PASSWORD
    ) {
      // Fetch actual admin user ID from database to authorize core Medusa admin API calls
      const adminResult = await pool.query('SELECT id FROM "user" WHERE email = $1', [email.toLowerCase()])
      const adminId = adminResult.rows[0]?.id || "admin"

      const token = generateToken({
        email: email.toLowerCase(),
        role: "admin",
        id: "admin",
        actor_id: adminId,
        actor_type: "user"
      })
      return res.status(200).json({
        message: "Login successful",
        token,
        user: { id: "admin", email: email.toLowerCase(), first_name: "Admin", last_name: "User", role: "admin" },
      })
    }

    // Customer login
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

    const inputHash = hashPassword(password)
    if (inputHash !== customer.password_hash) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    const token = generateToken({
      id: customer.id,
      email: customer.email,
      role: "customer",
    }, "7300d")

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        role: "customer",
      },
    })
  } catch (error: any) {
    console.error("Login error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}
