import { generateUUID } from '@/lib/utils';
import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { getFileAttachmentsWithContentByChatId } from '@/lib/db/queries';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';

interface RegulatoryDocumentWorkflowProps {
  session: Session;
  dataStream: DataStreamWriter;
  chatId: string;
}

export const regulatoryDocumentWorkflow = ({ session, dataStream, chatId }: RegulatoryDocumentWorkflowProps) =>
  tool({
    description: 'Create a regulatory document by guiding the user through the complete workflow: checking for templates, gathering source files, and generating the final document using RAG (Retrieval-Augmented Generation) to extract relevant information from uploaded files. This workflow integrates with the file upload system to use templates and source files.',
    parameters: z.object({
      documentTitle: z.string().describe('The title of the regulatory document to create'),
      documentType: z.string().describe('The type of regulatory document (e.g., "compliance report", "risk assessment", "audit report", "policy document")'),
      useTemplate: z.boolean().describe('Whether to use a template for the document structure'),
      requireSourceFiles: z.boolean().describe('Whether source files are needed for information extraction'),
      documentKind: z.enum(artifactKinds).describe('The kind of document to create (defaults to "text")'),
    }),
    execute: async ({ documentTitle, documentType, useTemplate, requireSourceFiles, documentKind = 'text' }) => {
      if (!session?.user?.id) {
        throw new Error('User must be authenticated to create regulatory documents');
      }

      dataStream.writeData({
        type: 'workflow-start',
        content: `Starting regulatory document workflow for: ${documentTitle}`,
      });

      try {
        // Check for existing template and source files in the chat
        const existingFiles = await getFileAttachmentsWithContentByChatId({ chatId });
        const templateFiles = existingFiles.filter(file => file.fileType === 'template');
        const sourceFiles = existingFiles.filter(file => file.fileType === 'source');

        // Step 1: Template Assessment
        dataStream.writeData({
          type: 'workflow-step',
          content: 'Step 1: Assessing template requirements...',
        });

        let templateContent = '';
        if (useTemplate) {
          if (templateFiles.length === 0) {
            dataStream.writeData({
              type: 'workflow-guidance',
              content: 'No template found. Please upload a template file first using the file upload interface.',
            });
            
            return {
              success: false,
              nextAction: 'upload_template',
              message: 'Template required but not found.',
              guidance: `To upload a template:
1. Use the file upload area in the chat interface
2. Select your template file (.docx, .pdf, or .txt)
3. Choose "Template" as the file type in the upload dialog
4. The template will be automatically processed and ready for use

Once uploaded, run this workflow again to continue with document creation.`,
            };
          } else {
            // Use the most recent template
            const template = templateFiles[0];
            templateContent = template.content || '';
            
            dataStream.writeData({
              type: 'workflow-template-found',
              content: `Using template: ${template.fileName}`,
            });
          }
        }

        // Step 2: Source Files Assessment
        dataStream.writeData({
          type: 'workflow-step',
          content: 'Step 2: Assessing source files...',
        });

        let sourceFileData: Array<{ name: string; content: string }> = [];
        if (requireSourceFiles) {
          if (sourceFiles.length === 0) {
            dataStream.writeData({
              type: 'workflow-guidance',
              content: 'No source files found. Please upload source files first using the file upload interface.',
            });
            
            return {
              success: false,
              nextAction: 'upload_source_files',
              message: 'Source files required but not found.',
              guidance: `To upload source files:
1. Use the file upload area in the chat interface
2. Select your source files (documents, data, or images)
3. Choose "Source" as the file type in the upload dialog
4. You can upload multiple files at once
5. Supported formats: .docx, .pdf, .txt, .csv, .json, .xlsx, images

Source files should contain the data and information you want to extract for your regulatory document. Once uploaded, run this workflow again to continue.`,
            };
          } else {
            sourceFileData = sourceFiles
              .filter(file => file.content)
              .map(file => ({
                name: file.fileName,
                content: file.content!,
              }));
            
            dataStream.writeData({
              type: 'workflow-sources-found',
              content: `Found ${sourceFileData.length} source files with content`,
            });
          }
        }

        // Step 3: Document Generation
        dataStream.writeData({
          type: 'workflow-step',
          content: 'Step 3: Generating regulatory document...',
        });

        const documentData = {
          templateContent,
          sourceFiles: sourceFileData,
        };

        // Generate a unique document ID
        const documentId = generateUUID();
        
        dataStream.writeData({ type: 'kind', content: documentKind });
        dataStream.writeData({ type: 'id', content: documentId });
        dataStream.writeData({ type: 'title', content: documentTitle });
        dataStream.writeData({ type: 'clear', content: '' });

        // Find the appropriate document handler
        const documentHandler = documentHandlersByArtifactKind.find(
          handler => handler.kind === documentKind
        );

        if (!documentHandler) {
          throw new Error(`No document handler found for kind: ${documentKind}`);
        }

        // Create the document using the handler
        await documentHandler.onCreateDocument({
          id: documentId,
          title: documentTitle,
          dataStream,
          session,
          documentData,
        });

        dataStream.writeData({ type: 'finish', content: '' });

        dataStream.writeData({
          type: 'workflow-complete',
          content: `Regulatory document "${documentTitle}" has been successfully created.`,
        });

        return {
          success: true,
          documentId,
          title: documentTitle,
          kind: documentKind,
          documentType,
          templateUsed: useTemplate ? templateFiles[0]?.fileName : null,
          sourceFilesUsed: sourceFileData.length,
          workflowSummary: {
            templateStatus: useTemplate ? `Used template: ${templateFiles[0]?.fileName}` : 'No template used',
            sourceFilesStatus: requireSourceFiles ? `Extracted information from ${sourceFileData.length} source files` : 'No source files used',
            documentGenerated: true,
          },
          message: `Successfully created regulatory document "${documentTitle}" of type "${documentType}". ${useTemplate ? `Template "${templateFiles[0]?.fileName}" was used for structure.` : ''} ${requireSourceFiles ? `Information was extracted from ${sourceFileData.length} source files.` : ''}`,
        };

      } catch (error) {
        dataStream.writeData({
          type: 'workflow-error',
          content: `Error in regulatory document workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });

        throw new Error(`Regulatory document workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  }); 