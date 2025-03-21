import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { fal } from '@ai-sdk/fal';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';
import { allmodels } from './openai-compatible-models';

const openai = createOpenAICompatible({
  name: "devtocode",
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL!,
});

// Create a map of language models from allmodels
const createLanguageModels = () => {
  const languageModels: Record<string, any> = {
    'chat-model': openai('provider-2/claude-3-7-sonnet-20250219'),
    'chat-model-reasoning': wrapLanguageModel({
      model: openai('provider-2/claude-3-7-sonnet-20250219'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'title-model': openai('provider-1/gemini-1.5-pro-latest'),
    'artifact-model': openai('provider-1/gemini-1.5-pro-latest'),
  };

  // Add all models from allmodels
  allmodels.forEach(model => {
    languageModels[model.id] = openai(model.id);
  });

  return languageModels;
};

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: createLanguageModels(),
      imageModels: {
        'small-model': fal.image('fal-ai/fast-sdxl'),
      },
    });
