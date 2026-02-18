# Must Haves

SQLite - Zero-dependency persistence for sessions, traces, and structured data
Hono - Lightweight TypeScript-first web framework for webhook/health endpoints
Zod - Schema-first validation everywhere: tool params, LLM structured output, config, API requests, inter-package contracts. Define Zod schema first, derive TypeScript type with `z.infer<>`.
Vercel AI SDK v6 (`ai`) - Multi-provider LLM abstraction with unified LanguageModel type
  - `@ai-sdk/anthropic` - Production Claude (Opus 4.6 / Sonnet 4.6)
  - `@ai-sdk/openai` - Production OpenAI
  - `@openrouter/ai-sdk-provider` - Dev/testing (300+ models, one key)
  - `ollama-ai-provider` - Local/offline models

# Optional depending on needs

BullMQ - For background job processing and heartbeat scheduling
Scalar - For documenting any REST/webhook API endpoints
Puppeteer/Playwright - For headless browser automation tools
Docker SDK - For sandboxed shell/code execution
