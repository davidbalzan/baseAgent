export interface IncomingMessageAttachment {
  kind: string;
  fileId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  caption?: string;
  payload?: Record<string, unknown>;
}

export interface IncomingMessage {
  text: string;
  channelId: string;
  userId: string;
  messageId: string;
  attachments?: IncomingMessageAttachment[];
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onTextReset?: () => void;
  onSessionStart?: (sessionId: string) => void;
  onToolCall: (toolName: string) => void;
  onToolResult?: (toolName: string, success: boolean, error?: string) => void;
  onFinish: (output: string, meta?: { sessionId?: string }) => void;
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
  sendMessage?(channelId: string, text: string): Promise<void>;
  requestConfirmation?(channelId: string, prompt: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }>;
}
