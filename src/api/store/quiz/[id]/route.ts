import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || process.env.JWT_SECRET || "supersecret"

function verifyAdminSecret(req: MedusaRequest): boolean {
  const secret = req.headers["x-admin-secret"] as string
  return secret === ADMIN_SECRET
}

// POST /store/quiz/:id - Update quiz question (admin only, verified by x-admin-secret header)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!verifyAdminSecret(req)) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  try {
    const quizService = req.scope.resolve("quiz")
    const { id } = req.params
    const { question_text, order_number, image_url, options } = req.body as any

    const question = await quizService.updateQuizQuestions({
      id,
      question_text,
      order_number: order_number !== undefined ? Number(order_number) : undefined,
      image_url,
      options,
    })

    res.json({ question })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to update quiz question" })
  }
}

// DELETE /store/quiz/:id - Delete quiz question (admin only, verified by x-admin-secret header)
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!verifyAdminSecret(req)) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  try {
    const quizService = req.scope.resolve("quiz")
    const { id } = req.params

    await quizService.deleteQuizQuestions(id)

    res.json({ message: "Quiz question deleted successfully" })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete quiz question" })
  }
}
