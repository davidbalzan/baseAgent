export type SendProactiveMessageFn = (channelId: string, text: string) => Promise<void>;

interface ProactiveAdapter {
  name: string;
  sendMessage: (channelId: string, text: string) => Promise<void>;
}

/**
 * Creates a function that routes a proactive message to the correct adapter
 * based on the channelId prefix (e.g., "telegram:12345" → telegram adapter).
 */
export function createProactiveMessenger(
  adapters: ProactiveAdapter[],
): SendProactiveMessageFn {
  const adapterMap = new Map<string, ProactiveAdapter>();
  for (const adapter of adapters) {
    adapterMap.set(adapter.name, adapter);
  }

  return async (channelId: string, text: string): Promise<void> => {
    const prefix = channelId.split(":")[0];
    const adapter = adapterMap.get(prefix);

    if (!adapter) {
      console.warn(`[proactive] No adapter found for prefix "${prefix}" (channelId: ${channelId})`);
      return;
    }

    await adapter.sendMessage(channelId, text);
  };
}
