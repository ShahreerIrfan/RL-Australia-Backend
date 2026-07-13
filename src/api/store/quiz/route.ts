import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || process.env.JWT_SECRET || "supersecret"

function verifyAdminSecret(req: MedusaRequest): boolean {
  const secret = req.headers["x-admin-secret"] as string
  return secret === ADMIN_SECRET
}

// GET /store/quiz - List all quiz questions (public)
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

// POST /store/quiz - Create a new quiz question (admin only, verified by x-admin-secret header)
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
    const { question_text, order_number, image_url, options } = req.body as any

    const question = await quizService.createQuizQuestions({
      question_text,
      order_number: Number(order_number) || 0,
      image_url: image_url || null,
      options: options || [],
    })

    res.status(201).json({ question })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to create quiz question" })
  }
}
