import { model } from "@medusajs/framework/utils"

const Lead = model.define("lead", {
  id: model.id().primaryKey(),
  email: model.text(),
  guide_id: model.text(),
})

export default Lead
