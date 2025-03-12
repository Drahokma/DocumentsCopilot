import { generateUUID } from '@/lib/utils';
import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';

interface CreateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
  documentData?: {
    templateContent?: string;
    sourceFiles?: Array<{ name: string; content: string }>;
  };
}

export const createDocument = ({ session, dataStream, documentData }: CreateDocumentProps) =>
  tool({
    description:
      'Create a document using the provided title and kind. For substantial content (>10 lines), structured documents, or reusable content (essays, emails, code). When template content is provided, maintains template structure and formatting while extracting relevant information from source files to fill template sections appropriately.',
    parameters: z.object({
      title: z.string().describe('The title of the document to create'),
      kind: z.enum(artifactKinds).describe('The kind of document to create (text, code, sheet, etc.)'),
    }),
    execute: async ({ title, kind}) => {
      const id = generateUUID();
  
      dataStream.writeData({ type: 'kind', content: kind });
      dataStream.writeData({ type: 'id', content: id });
      dataStream.writeData({ type: 'title', content: title });
      dataStream.writeData({ type: 'clear', content: '' });
  
      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) => documentHandlerByArtifactKind.kind === kind,
      );
  
      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }
  
      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        session,
        documentData,
      });
  
      dataStream.writeData({ type: 'finish', content: '' });
  
      return {
        id,
        title,
        kind,
        content: 'A document was created and is now visible to the user.',
      };
    },
  });