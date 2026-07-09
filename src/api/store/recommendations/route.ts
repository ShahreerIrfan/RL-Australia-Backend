import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /store/recommendations - Lists goal-based stacks with fully populated products
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const recommendationService = req.scope.resolve("recommendation")
    const query = req.scope.resolve("query")

    // Fetch raw recommendations from the custom module
    const rawRecommendations = await recommendationService.listGoalRecommendations()

    // Populate product data for each goal
    const recommendations = await Promise.all(
      rawRecommendations.map(async (rec: any) => {
        const productIds = rec.product_ids || []

        let products: any[] = []
        if (productIds.length > 0) {
          try {
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
                "variants.calculated_price",
              ],
              filters: {
                id: productIds,
              },
            })
            products = data || []
          } catch (e) {
            // If product query fails, return empty products
            products = []
          }
        }

        return {
          id: rec.id,
          icon: rec.icon || "Heart",
          goal_name: rec.goal_name,
          description: rec.description,
          products: products,
        }
      })
    )

    res.json({ recommendations })
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err.message || "Failed to fetch stack recommendations" })
  }
}
