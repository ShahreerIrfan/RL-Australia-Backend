import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || process.env.JWT_SECRET || "supersecret"

function verifyAdminSecret(req: MedusaRequest): boolean {
  const secret = req.headers["x-admin-secret"] as string
  return secret === ADMIN_SECRET
}

// POST /store/recommendations/:id - Update a goal (admin only)
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
    const { id } = req.params
    const { icon, goal_name, description, product_ids } = req.body as any

    const updated = await recommendationService.updateGoalRecommendations({
      id,
      icon,
      goal_name,
      description,
      product_ids,
    })

    res.json({ goal: updated })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to update goal" })
  }
}

// DELETE /store/recommendations/:id - Delete a goal (admin only)
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!verifyAdminSecret(req)) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  try {
    const recommendationService = req.scope.resolve("recommendation")
    const { id } = req.params

    await recommendationService.deleteGoalRecommendations(id)
    res.json({ message: "Deleted successfully" })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete goal" })
  }
}
