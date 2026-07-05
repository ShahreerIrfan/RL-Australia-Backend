import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: {
        ssl: false,
      },
      pool: {
        min: 0,
        max: 15,
        idleTimeoutMillis: 5000,
        acquireTimeoutMillis: 60000,
      }
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "./src/modules/saved-stack",
    },
    {
      resolve: "./src/modules/guide",
    },
    {
      resolve: "./src/modules/recommendation",
    },
    {
      resolve: "./src/modules/car",
    },
  ]
})
