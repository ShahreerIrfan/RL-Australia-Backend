import { MedusaService } from "@medusajs/framework/utils"
import QuizQuestion from "./models/quiz-question"

class QuizModuleService extends MedusaService({
  QuizQuestion,
}) {}

export default QuizModuleService
