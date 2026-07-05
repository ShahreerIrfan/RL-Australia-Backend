import GuideModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const GUIDE_MODULE = "guide"

export default Module(GUIDE_MODULE, {
  service: GuideModuleService,
})
