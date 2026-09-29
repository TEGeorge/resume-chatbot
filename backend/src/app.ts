import { Hono } from 'hono'
import { openAPIRouteHandler } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { basicAuth } from 'hono/basic-auth'
import { chat } from './routes/chat.js'

const username = process.env.BASIC_AUTH_USERNAME
const password = process.env.BASIC_AUTH_PASSWORD

if (!username || !password) {
  throw new Error('BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set')
}

export const app = new Hono()

app.use('*', basicAuth({ username, password }))

const routes = app.route('/chat', chat)

app.get(
  '/doc',
  openAPIRouteHandler(app, {
    documentation: { info: { title: 'Resume Chatbot API', version: '0.1.0' } },
  }),
)

app.get('/swagger', swaggerUI({ url: '/doc' }))

// Import as a type from the frontend for Hono RPC: `hc<AppType>(baseUrl)`
export type AppType = typeof routes
