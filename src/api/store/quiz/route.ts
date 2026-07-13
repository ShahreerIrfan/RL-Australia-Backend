import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const quizService = req.scope.resolve("quiz")
    const questions = await quizService.listQuizQuestions({}, {
      order: { order_number: "ASC" }
    })
    res.json({ questions })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to list quiz questions" })
  }
}
