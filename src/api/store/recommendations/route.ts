import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /store/recommendations - Lists goal-based stacks along with fully populated product cards
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const query = req.scope.resolve("query")

    // Fetch raw recommendations from the custom database module
    const rawRecommendations = await recommendationService.listGoalRecommendations()

    // Fully populate product profiles for each recommended goal
    const recommendations = await Promise.all(
      rawRecommendations.map(async (rec: any) => {
        const productIds = rec.product_ids || []
        
        let products: any[] = []
        if (productIds.length > 0) {
          const { data } = await query.graph({
            entity: "product",
            fields: [
              "id", 
              "title", 
              "handle", 
              "thumbnail", 
              "description",
              "metadata",
              "variants.id",
              "variants.title",
              "variants.sku",
              "variants.metadata",
              "variants.calculated_price"
            ],
            filters: {
              id: productIds
            }
          })
          products = data || []
        }

        return {
          id: rec.id,
          goal_name: rec.goal_name,
          description: rec.description,
          products: products
        }
      })
    )

    res.json({ recommendations })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch stack recommendations" })
  }
}
