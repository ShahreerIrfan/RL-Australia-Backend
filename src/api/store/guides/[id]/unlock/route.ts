import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// POST /store/guides/:id/unlock - Submits email to unlock a gated guide and save lead
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const { email } = req.body as any

  if (!email || !email.includes("@")) {
    res.status(400).json({ message: "A valid email address is required" })
    return
  }

  try {
    const guideService = req.scope.resolve("guide")

    // Retrieve the guide
    const guide = await guideService.retrieveGuide(id)
    if (!guide) {
      res.status(404).json({ message: "Guide not found" })
      return
    }

    // Save lead record in database
    await guideService.createLeads({
      email,
      guide_id: id,
    })

    // Return the guide including the actual pdf_url since it is unlocked
    res.json({
      unlocked: true,
      guide: {
        id: guide.id,
        title: guide.title,
        handle: guide.handle,
        pdf_url: guide.pdf_url,
        is_gated: guide.is_gated,
        description: guide.description,
      },
    })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to unlock guide" })
  }
}
