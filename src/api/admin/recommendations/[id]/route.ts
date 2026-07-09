import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /admin/recommendations/:id - Get a single goal
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const { id } = req.params

    const goals = await recommendationService.listGoalRecommendations({
      id: id,
    })

    if (!goals || goals.length === 0) {
      res.status(404).json({ message: "Goal not found" })
      return
    }

    res.json({ goal: goals[0] })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch goal" })
  }
}

// PUT /admin/recommendations/:id - Update a goal
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const { id } = req.params
    const { icon, goal_name, description, product_ids } = req.body as any

    const updatedGoal = await recommendationService.updateGoalRecommendations({
      id,
      icon,
      goal_name,
      description,
      product_ids,
    })

    res.json({ goal: updatedGoal })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to update goal" })
  }
}

// DELETE /admin/recommendations/:id - Delete a goal
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const { id } = req.params

    await recommendationService.deleteGoalRecommendations(id)
    res.status(200).json({ message: "Goal deleted successfully" })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete goal" })
  }
}
