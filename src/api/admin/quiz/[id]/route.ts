import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
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

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const quizService = req.scope.resolve("quiz")
    const { id } = req.params

    await quizService.deleteQuizQuestions(id)

    res.json({ message: "Quiz question deleted successfully" })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete quiz question" })
  }
}
