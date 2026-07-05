import { model } from "@medusajs/framework/utils"

const Car = model.define("car", {
  id: model.id().primaryKey(),
  name: model.text(),
  brand: model.text(),
  year: model.number(),
  color: model.text().nullable(),
})

export default Car
