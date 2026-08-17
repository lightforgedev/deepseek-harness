#!/usr/bin/env node
/**
 * Emits one real DSH telemetry record through the built OTLP/HTTP exporter.
 * The AEGIS minimizer is supplied by absolute path so this fork never embeds
 * AEGIS policy code or credentials.
 */
import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import OpenTelemetrySessionBackend, { SessionTelemetryMode } from '@deepseek-ai/dsh-session-telemetry-otel'

const required = ['AEGIS_DSH_OTEL_PLUGIN', 'AEGIS_DSH_OTEL_URL', 'AEGIS_DSH_OTEL_SESSION_ID']
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`)
}

const { installDshOtelMinimizer } = await import(process.env.AEGIS_DSH_OTEL_PLUGIN)
const ctx = new Context()
await ctx.plugin(SessionStore)
installDshOtelMinimizer(ctx)
const fiber = await ctx.plugin(OpenTelemetrySessionBackend, {
  mode: SessionTelemetryMode.FULL,
  exporter: {
    url: process.env.AEGIS_DSH_OTEL_URL,
    headers: { authorization: `Bearer ${process.env.AEGIS_DSH_OTEL_TOKEN ?? ''}` },
  },
  resourceAttributes: {
    'aegis.provider': 'dsh',
    'aegis.session_id': process.env.AEGIS_DSH_OTEL_SESSION_ID,
  },
  processor: { scheduledDelayMillis: 10 },
})

try {
  const session = ctx.sessions.create(SessionId(process.env.AEGIS_DSH_OTEL_SESSION_ID), { meta: {} })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      source: { provider: 'test', model: 'test' },
      content: [{ type: 'text', text: 'DSH_OTEL_RAW_BODY_SENTINEL' }],
    }),
  }, { surfaceOp: 'append' })
} finally {
  await fiber.dispose()
}
