import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /store/guides - Lists all downloadable guides
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const guideService = req.scope.resolve("guide")
    const rawGuides = await guideService.listGuides()

    // Map guides: mask the pdf_url for gated guides to enforce lead generation
    const guides = rawGuides.map((guide: any) => {
      if (guide.is_gated) {
        return {
          ...guide,
          pdf_url: "#gated", // User must unlock to get the real PDF link
        }
      }
      return guide
    })

    res.json({ guides })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch guides" })
  }
}
