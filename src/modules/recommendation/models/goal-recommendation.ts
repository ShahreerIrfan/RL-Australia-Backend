import { model } from "@medusajs/framework/utils"

const GoalRecommendation = model.define("goal_recommendation", {
  id: model.id().primaryKey(),
  icon: model.text().default("Heart"),
  goal_name: model.text().unique(),
  description: model.text().nullable(),
  product_ids: model.json(), // ["prod_1", "prod_2"]
})

export default GoalRecommendation
