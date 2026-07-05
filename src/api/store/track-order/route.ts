import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /store/track-order?id=order_123&email=user@example.com
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const orderId = req.query.id as string
  const email = req.query.email as string

  if (!orderId || !email) {
    res.status(400).json({ message: "Order ID and Email address are required parameters" })
    return
  }

  try {
    const query = req.scope.resolve("query")

    // Retrieve order by ID or Display ID
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id", 
        "display_id", 
        "email", 
        "status", 
        "created_at",
        "total",
        "fulfillments.id",
        "items.title",
        "items.quantity",
        "items.unit_price"
      ],
      filters: {
        id: orderId
      } as any
    })

    if (!orders || orders.length === 0) {
      res.status(404).json({ message: "Order not found" })
      return
    }

    const order = orders[0] as any

    // Verify email matches case-insensitively
    if (!order.email || order.email.toLowerCase() !== email.toLowerCase()) {
      res.status(401).json({ message: "Access denied: Email does not match this order" })
      return
    }

    // Determine simplified status states (e.g. processing, shipped, delivered)
    let simplifiedStatus = "processing"
    if (order.status === "canceled") {
      simplifiedStatus = "canceled"
    } else if (order.status === "completed") {
      simplifiedStatus = "delivered"
    } else if (order.fulfillments && order.fulfillments.length > 0) {
      simplifiedStatus = "shipped"
    }

    res.json({
      order: {
        id: order.id,
        display_id: order.display_id,
        created_at: order.created_at,
        status: order.status,
        tracking_status: simplifiedStatus, // processing, shipped, delivered, canceled
        total: order.total,
        items: order.items,
        shipping_protection_included: true,
      }
    })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to retrieve order tracking info" })
  }
}
