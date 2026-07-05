import { MedusaService } from "@medusajs/framework/utils"
import Car from "./models/car"

class CarModuleService extends MedusaService({
  Car,
}) {}

export default CarModuleService
