/**
 * Optional OmniRoute live check. Not collected by `npm test`.
 *
 *   LLM_PROVIDER=omniroute LLM_MODEL=auto LLM_API_KEY=... npx ts-node tests/ai/omniroute.manual.ts
 */
import { LLMGateway } from '../../src/application/ai/LLMGateway';
import { createLLMProviderFromEnv } from '../../src/infrastructure/ai/createLLMProvider';

async function main(): Promise<void> {
  const provider = createLLMProviderFromEnv(process.env);
  if (provider.name === 'fake') {
    throw new Error('Set LLM_PROVIDER=omniroute (and LLM_MODEL/LLM_API_KEY as needed) to run this check');
  }
  const gateway = new LLMGateway(provider);
  const response = await gateway.complete({
    systemInstruction: 'Reply with the single word pong.',
    userInput: 'ping'
  });
  if (response.text.trim().length === 0) {
    throw new Error('OmniRoute returned empty text');
  }
  process.stdout.write(`provider=${response.provider ?? provider.name} model=${response.model ?? ''} text=${JSON.stringify(response.text)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
