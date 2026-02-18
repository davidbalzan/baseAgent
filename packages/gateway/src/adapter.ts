export interface IncomingMessage {
  text: string;
  channelId: string;
  userId: string;
  messageId: string;
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onToolCall: (toolName: string) => void;
  onFinish: (output: string) => void;
  onError: (error: Error) => void;
}

export type HandleMessageFn = (
  message: IncomingMessage,
  stream: StreamCallbacks,
) => Promise<void>;

export interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
