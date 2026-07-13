import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const query = req.scope.resolve("query")
    const idsParam = req.query.product_ids as string

    if (!idsParam) {
      res.json({ products: [] })
      return
    }

    const productIds = idsParam.split(",").filter(Boolean)
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

    res.json({ products })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch quiz recommendations" })
  }
}
