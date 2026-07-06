import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import pool from "../../../lib/db"
import { verifyToken } from "../../../lib/auth"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" })
    }

    const token = authHeader.split(" ")[1]
    const payload = verifyToken(token)

    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" })
    }

    if (payload.role === "admin") {
      return res.status(200).json({
        user: {
          id: "admin",
          email: process.env.ADMIN_EMAIL,
          first_name: "Admin",
          last_name: "User",
          role: "admin",
        },
      })
    }

    // Fetch customer data
    const result = await pool.query(
      "SELECT id, email, first_name, last_name, phone FROM rl_customers WHERE id = $1 AND is_active = true",
      [payload.id]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "User not found" })
    }

    const customer = result.rows[0]

    return res.status(200).json({
      user: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        role: "customer",
      },
    })
  } catch (error: any) {
    console.error("Me error:", error)
    return res.status(401).json({ message: "Not authenticated" })
  }
}
