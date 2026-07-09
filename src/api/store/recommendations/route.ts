import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || process.env.JWT_SECRET || "supersecret"

function verifyAdminSecret(req: MedusaRequest): boolean {
  const secret = req.headers["x-admin-secret"] as string
  return secret === ADMIN_SECRET
}

// GET /store/recommendations - Lists all goals with fully populated products (public)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const query = req.scope.resolve("query")

    const rawRecommendations = await recommendationService.listGoalRecommendations()

    const recommendations = await Promise.all(
      rawRecommendations.map(async (rec: any) => {
        const productIds = rec.product_ids || []
        let products: any[] = []

        if (productIds.length > 0) {
          try {
            const { data } = await query.graph({
              entity: "product",
              fields: [
                "id", "title", "handle", "thumbnail", "description", "metadata",
                "variants.id", "variants.title", "variants.sku", "variants.metadata",
                "variants.calculated_price",
              ],
              filters: { id: productIds },
            })
            products = data || []
          } catch (e) {
            products = []
          }
        }

        return {
          id: rec.id,
          icon: rec.icon || "Heart",
          goal_name: rec.goal_name,
          description: rec.description,
          product_ids: rec.product_ids || [],
          products,
        }
      })
    )

    res.json({ recommendations, goals: recommendations })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch recommendations" })
  }
}

// POST /store/recommendations - Create a new goal (admin only, requires x-admin-secret header)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!verifyAdminSecret(req)) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  try {
    const recommendationService = req.scope.resolve("recommendation")
    const { icon, goal_name, description, product_ids } = req.body as any

    if (!goal_name) {
      res.status(400).json({ message: "goal_name is required" })
      return
    }

    const goal = await recommendationService.createGoalRecommendations({
      icon: icon || "Heart",
      goal_name,
      description: description || "",
      product_ids: product_ids || [],
    })

    res.status(201).json({ goal })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to create goal" })
  }
}
