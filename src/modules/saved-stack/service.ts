import { MedusaService } from "@medusajs/framework/utils"
import SavedStack from "./models/saved-stack"

class SavedStackModuleService extends MedusaService({
  SavedStack,
}) {}

export default SavedStackModuleService
