import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /admin/recommendations - List all goals
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const goals = await recommendationService.listGoalRecommendations()
    res.json({ goals })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to list goals" })
  }
}

// POST /admin/recommendations - Create a new goal
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
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
