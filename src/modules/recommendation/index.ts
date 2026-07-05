import RecommendationModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const RECOMMENDATION_MODULE = "recommendation"

export default Module(RECOMMENDATION_MODULE, {
  service: RecommendationModuleService,
})
