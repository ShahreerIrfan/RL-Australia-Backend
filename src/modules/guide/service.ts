import { MedusaService } from "@medusajs/framework/utils"
import Guide from "./models/guide"
import Lead from "./models/lead"

class GuideModuleService extends MedusaService({
  Guide,
  Lead,
}) {}

export default GuideModuleService
