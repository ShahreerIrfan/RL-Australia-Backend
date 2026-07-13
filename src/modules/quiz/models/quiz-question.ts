import { model } from "@medusajs/framework/utils"

const QuizQuestion = model.define("quiz_question", {
  id: model.id().primaryKey(),
  question_text: model.text(),
  order_number: model.number().default(0),
  image_url: model.text().nullable(),
  options: model.json(), // [{ id: string, option_text: string, product_ids: string[] }]
})

export default QuizQuestion
