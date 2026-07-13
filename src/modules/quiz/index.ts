import QuizModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const QUIZ_MODULE = "quiz"

export default Module(QUIZ_MODULE, {
  service: QuizModuleService,
})
