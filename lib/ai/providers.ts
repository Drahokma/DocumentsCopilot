import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { fireworks } from '@ai-sdk/fireworks';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

import { createAzure } from '@ai-sdk/azure';

const azure = createAzure({
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  baseURL: process.env.AZURE_BASE_URL!,
})

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model-small': azure('gpt-4o-mini'),
        'chat-model-large': azure('gpt-4o'),
        'chat-model-reasoning': azure('o3-mini'),
        'title-model': azure('gpt-4o'),
        'artifact-model': azure('gpt-4o-mini'),
      },
      textEmbeddingModels: {
        'embedding-model': azure.textEmbeddingModel('text-embedding-3-large', {
          dimensions: 1536,
        }),
      },

    })
  : customProvider({
      languageModels: {
        'chat-model-small': azure('gpt-4o-mini'),
        'chat-model-large': azure('gpt-4o'),
        'chat-model-reasoning': azure('o3-mini'),
        'title-model': azure('gpt-4o'),
        'artifact-model': azure('gpt-4o-mini'),
      },
      imageModels: {
        'small-model': azure.image('dall-e-2'),
        'large-model': azure.image('dall-e-3'),
      },
      textEmbeddingModels: {
        'embedding-model': azure.textEmbeddingModel('text-embedding-3-large', {
          dimensions: 1536,
        }),
      },
    });
