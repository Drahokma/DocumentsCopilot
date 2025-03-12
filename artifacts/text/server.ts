import { smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { updateDocumentPrompt, documentGenerationPrompt } from '@/lib/ai/prompts';

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async ({ title, dataStream, documentData }) => {
    let draftContent = '';
    
    try {
      // Use the documentGenerationPrompt for document creation
      const systemPrompt = documentData?.templateContent 
        ? documentGenerationPrompt
        : 'Write about the given topic. Markdown is supported. Use headings wherever appropriate and create a well-structured document.';

      const { fullStream } = streamText({
        model: myProvider.languageModel('artifact-model'),
        system: systemPrompt,
        experimental_transform: smoothStream({ chunking: 'word' }),
        prompt: documentData?.sourceFiles?.length 
          ? `Title: ${title}\n\nSource Files to Reference:\n${documentData.sourceFiles
              .map(file => `${file.name}:\n${file.content}\n`)
              .join('\n')}`
          : title,
      });

      for await (const delta of fullStream) {
        const { type } = delta;

        if (type === 'text-delta') {
          const { textDelta } = delta;

          draftContent += textDelta;

          dataStream.writeData({
            type: 'text-delta',
            content: textDelta,
          });
        }
      }

      return draftContent;
    } catch (error) {
      console.error('Error in onCreateDocument:', error);
      dataStream.writeData({
        type: 'error',
        error: String(error),
      });
      throw error;
    }
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    try {
      const { fullStream } = streamText({
        model: myProvider.languageModel('artifact-model'),
        system: updateDocumentPrompt(document.content, 'text'),
        experimental_transform: smoothStream({ chunking: 'word' }),
        prompt: description,
        experimental_providerMetadata: {
          openai: {
            prediction: {
              type: 'content',
              content: document.content,
            },
          },
        },
      });

      for await (const delta of fullStream) {
        const { type } = delta;

        if (type === 'text-delta') {
          const { textDelta } = delta;

          draftContent += textDelta;
          dataStream.writeData({
            type: 'text-delta',
            content: textDelta,
          });
        }
      }

      return draftContent;
    } catch (error) {
      console.error('Error in onUpdateDocument:', error);
      dataStream.writeData({
        type: 'error',
        error: String(error),
      });
      throw error;
    }
  },
});
