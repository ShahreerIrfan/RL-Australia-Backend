import { MedusaContainer } from "@medusajs/framework/types"
import { exec } from "child_process"

export default async function adminInitializerLoader(
  container: MedusaContainer
): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    const logger = container.resolve("logger")
    logger.warn("ADMIN_EMAIL or ADMIN_PASSWORD is not set. Skipped admin user auto-initialization.")
    return
  }

  try {
    const query = container.resolve("query")
    const { data: users } = await query.graph({
      entity: "user",
      fields: ["id", "email"],
      filters: { email },
    })

    if (users && users.length === 0) {
      const logger = container.resolve("logger")
      logger.info(`Admin user not found. Creating admin user: ${email}...`)
      
      // Execute the Medusa CLI command to create the user and hook up Auth configurations automatically
      exec(`npx medusa user -e ${email} -p ${password}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to create admin user: ${error.message}`)
          return
        }
        logger.info(`Admin user ${email} created successfully!`)
      })
    }
  } catch (err: any) {
    const logger = container.resolve("logger")
    logger.error(`Error checking/creating admin user: ${err.message}`)
  }
}
