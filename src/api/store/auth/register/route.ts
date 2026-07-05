import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import pool from "../../lib/db"
import { hashPassword, generateToken } from "../../lib/auth"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { email, password, first_name, last_name, phone } = req.body as any

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({
        message: "email, password, first_name, and last_name are required",
      })
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" })
    }

    // Check if customer already exists
    const existing = await pool.query("SELECT id FROM rl_customers WHERE email = $1", [email.toLowerCase()])
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "A customer with this email already exists" })
    }

    // Create customer
    const password_hash = hashPassword(password)
    const result = await pool.query(
      `INSERT INTO rl_customers (email, password_hash, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, phone, created_at`,
      [email.toLowerCase(), password_hash, first_name, last_name, phone || null]
    )

    const customer = result.rows[0]

    // Generate token so user is logged in immediately
    const token = generateToken({
      id: customer.id,
      email: customer.email,
      role: "customer",
    }, "7300d")

    return res.status(201).json({
      message: "Account created successfully",
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
    console.error("Register error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}
