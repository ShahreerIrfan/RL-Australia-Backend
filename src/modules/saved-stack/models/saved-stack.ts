import { model } from "@medusajs/framework/utils"

const SavedStack = model.define("saved_stack", {
  id: model.id().primaryKey(),
  name: model.text(),
  customer_id: model.text().nullable(),
  goal: model.text().nullable(),
  items: model.json(), // [{ variant_id: string, quantity: number }]
})

export default SavedStack
