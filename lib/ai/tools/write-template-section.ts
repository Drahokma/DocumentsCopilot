import { DataStreamWriter, tool, streamText } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { findRelevantContent } from '@/lib/ai/embeddings';
import { myProvider } from '../providers';

interface WriteTemplateSectionProps {
  session: Session;
  dataStream: DataStreamWriter;
  chatId: string;
}

export const writeTemplateSection = ({ session, dataStream, chatId }: WriteTemplateSectionProps) =>
  tool({
    description: 'Write content for a template section based on source materials',
    parameters: z.object({
      section: z.object({
        title: z.string(),
        requirements: z.array(z.string()),
        parentSection: z.string().optional(),
      }),
      chatId: z.string(),
    }),
    execute: async ({ section, chatId }) => {
      // Get relevant content from source files
      const relevantContent = await findRelevantContent(
        `${section.title} ${section.requirements.join(' ')}`,
        chatId
      );

      let sectionContent = '';
      
      const { fullStream } = streamText({
        model: myProvider.languageModel('artifact-model'),
        system: `You are a professional writer creating content for a document section.
                Write content that addresses all requirements and uses the provided source materials.
                Format output in Markdown.
                Context: This section "${section.title}" ${section.parentSection ? `is part of "${section.parentSection}"` : 'is a main section'}`,
        prompt: `Requirements:
                ${section.requirements.map(r => `- ${r}`).join('\n')}
                
                Source Materials:
                ${relevantContent.map(c => c.content).join('\n\n')}`,
      });

      for await (const delta of fullStream) {
        if (delta.type === 'text-delta') {
          sectionContent += delta.textDelta;
          dataStream.writeData({
            type: 'section-content',
            content: {
              title: section.title,
              delta: delta.textDelta
            }
          });
        }
      }

      return {
        title: section.title,
        content: sectionContent
      };
    },
  }); 