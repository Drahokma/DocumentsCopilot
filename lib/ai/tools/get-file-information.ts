// lib/ai/tools/get-file-information.ts
import { DataStreamWriter, tool } from 'ai';
import { Session } from 'next-auth';
import { z } from 'zod';
import { findRelevantContent } from '@/lib/ai/embeddings';

interface GetFileInformationProps {
  session: Session;
  dataStream: DataStreamWriter;
  chatId: string;
}

export const getFileInformation = ({ session, dataStream, chatId }: GetFileInformationProps) =>
  tool({
    description: `Get information from uploaded files to answer questions.`,
    parameters: z.object({
      question: z.string().describe('the user\'s question about file content'),
    }),
    execute: async ({ question }) => {
      if (!chatId) {
        return {
          found: false,
          message: "Unable to determine the current chat context."
        };
      }
      
      const relevantContent = await findRelevantContent(question, chatId);
      
      dataStream.writeData({
        type: 'search-results',
        content: JSON.stringify(relevantContent),
      });
      
      if (relevantContent.length === 0) {
        return {
          found: false,
          message: "No relevant information found in uploaded files."
        };
      }
      
      return {
        found: true,
        results: relevantContent
      };
    },
  });