import { apiFetchJson } from './apiClient';

const OPENROUTER_VISION_MODEL =
  (import.meta.env.VITE_OPENROUTER_VISION_MODEL as string | undefined) || 'google/gemini-3-flash-preview';

export async function createOpenRouterVisionCompletion(args: {
  prompt: string;
  imageDataUrl: string; // data:image/...;base64,...
  model?: string;
  maxTokens?: number;
}) {
  return apiFetchJson<{ content: string; raw?: unknown }>('/api/openrouter/vision', {
    body: {
      prompt: args.prompt,
      imageDataUrl: args.imageDataUrl,
      model: args.model || OPENROUTER_VISION_MODEL,
      maxTokens: args.maxTokens ?? 900,
    },
  });
}
