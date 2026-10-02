import { swaggerUI } from '@hono/swagger-ui'
import { Hono } from 'hono'
import { openAPIRouteHandler } from 'hono-openapi'
import { chat } from './routes/chat.js'
import { jobRoutes } from './routes/jobs.js'
import { resumeRoutes } from './routes/resumes.js'
import { scoreRoutes } from './routes/scores.js'
import { type AppEnv, type Services, servicesMiddleware } from './services/index.js'

// Everything the app needs comes in as arguments, so tests can pass fake services
export function createApp({ services }: { services: Services }) {
  const app = new Hono<AppEnv>()

  app.use('*', servicesMiddleware(services))

  const routes = app.route('/chat', chat).route('/resumes', resumeRoutes).route('/jobs', jobRoutes).route('/scores', scoreRoutes)

  app.get(
    '/doc',
    openAPIRouteHandler(app, {
      documentation: { info: { title: 'Resume Chatbot API', version: '0.1.0' } },
    }),
  )

  app.get('/swagger', swaggerUI({ url: '/doc' }))

  return routes
}

// Import as a type from the frontend for Hono RPC: `hc<AppType>(baseUrl)`
export type AppType = ReturnType<typeof createApp>
