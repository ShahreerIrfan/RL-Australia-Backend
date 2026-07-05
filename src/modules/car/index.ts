import CarModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const CAR_MODULE = "car"

export default Module(CAR_MODULE, {
  service: CarModuleService,
})
