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
      storeCors: process.env.STORE_CORS ? process.env.STORE_CORS.split(",").map(url => url.trim()) : [],
      adminCors: process.env.ADMIN_CORS ? process.env.ADMIN_CORS.split(",").map(url => url.trim()) : [],
      authCors: process.env.AUTH_CORS ? process.env.AUTH_CORS.split(",").map(url => url.trim()) : [],
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  admin: {
    disable: true
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
