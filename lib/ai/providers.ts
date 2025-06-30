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
  apiVersion: '2025-01-01-preview',
})

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model-small': azure('gpt-4o-mini'),
        'chat-model-large': azure('gpt-4.1'),
        'chat-model-reasoning': azure('o3-pro'),

        'title-model': azure('gpt-4.1'),
        'artifact-model': azure('gpt-4.1'),
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
        'chat-model-large': azure('gpt-4.1'),
        'chat-model-reasoning': azure('o3-pro'),
        'title-model': azure('gpt-4.1'),
        'artifact-model': azure('o3-pro'),
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
