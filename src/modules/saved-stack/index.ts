import SavedStackModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const SAVED_STACK_MODULE = "saved_stack"

export default Module(SAVED_STACK_MODULE, {
  service: SavedStackModuleService,
})
