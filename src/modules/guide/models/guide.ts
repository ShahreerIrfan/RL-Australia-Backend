import { model } from "@medusajs/framework/utils"

const Guide = model.define("guide", {
  id: model.id().primaryKey(),
  title: model.text(),
  handle: model.text().unique(),
  pdf_url: model.text(),
  is_gated: model.boolean().default(false),
  description: model.text().nullable(),
})

export default Guide
