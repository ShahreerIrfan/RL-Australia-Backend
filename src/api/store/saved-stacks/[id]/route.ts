import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// DELETE /store/saved-stacks/:id - Deletes a saved stack
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id || req.headers["x-customer-id"] || req.query.customer_id
  const { id } = req.params

  if (!customerId) {
    res.status(401).json({ message: "Customer authentication required" })
    return
  }

  try {
    const savedStackService = req.scope.resolve("saved_stack")

    // Fetch the stack first to ensure it belongs to the authenticated customer
    const stack = await savedStackService.retrieveSavedStack(id)
    if (!stack || stack.customer_id !== customerId) {
      res.status(404).json({ message: "Saved stack not found or access denied" })
      return
    }

    await savedStackService.deleteSavedStacks(id)
    res.json({ message: "Saved stack deleted successfully", id })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete saved stack" })
  }
}
