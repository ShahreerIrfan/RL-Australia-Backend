import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /store/saved-stacks - Lists saved stacks for a customer
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id || req.headers["x-customer-id"] || req.query.customer_id

  if (!customerId) {
    res.status(401).json({ message: "Customer authentication required" })
    return
  }

  try {
    const savedStackService = req.scope.resolve("saved_stack")
    const savedStacks = await savedStackService.listSavedStacks({
      customer_id: customerId,
    })

    res.json({ saved_stacks: savedStacks })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch saved stacks" })
  }
}

// POST /store/saved-stacks - Creates a new saved stack for a customer
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id || req.headers["x-customer-id"] || (req.body as any).customer_id
  const { name, goal, items } = req.body as any

  if (!customerId) {
    res.status(401).json({ message: "Customer authentication required" })
    return
  }

  if (!name || !items || !Array.isArray(items)) {
    res.status(400).json({ message: "Name and items array are required" })
    return
  }

  try {
    const savedStackService = req.scope.resolve("saved_stack")
    const newStack = await savedStackService.createSavedStacks({
      name,
      customer_id: customerId,
      goal: goal || null,
      items,
    } as any)

    res.status(201).json({ saved_stack: newStack })
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to save stack" })
  }
}
