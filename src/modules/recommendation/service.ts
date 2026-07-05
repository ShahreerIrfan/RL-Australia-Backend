import { MedusaService } from "@medusajs/framework/utils"
import GoalRecommendation from "./models/goal-recommendation"

class RecommendationModuleService extends MedusaService({
  GoalRecommendation,
}) {}

export default RecommendationModuleService
