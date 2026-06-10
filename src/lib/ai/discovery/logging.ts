type OpenAiLogSuccess = {
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type OpenAiLogError = {
  model: string;
  durationMs: number;
  error: string;
  code?: string;
};

export function logOpenAiDiscoverySuccess(payload: OpenAiLogSuccess): void {
  console.info(
    `[AI:OPENAI] model: ${payload.model} duration: ${payload.durationMs}ms tokens: ${
      payload.totalTokens ??
      (payload.inputTokens != null && payload.outputTokens != null
        ? `${payload.inputTokens}+${payload.outputTokens}`
        : "unknown")
    } success: true`
  );
}

export function logOpenAiDiscoveryError(payload: OpenAiLogError): void {
  console.error(
    `[AI:OPENAI:ERROR] model: ${payload.model} duration: ${payload.durationMs}ms code: ${
      payload.code ?? "unknown"
    } error: ${payload.error}`
  );
}
