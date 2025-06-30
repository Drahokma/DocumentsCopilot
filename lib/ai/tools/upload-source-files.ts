import { generateUUID } from '@/lib/utils';
import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { getFileAttachmentsWithContentByChatId } from '@/lib/db/queries';

interface UploadSourceFilesProps {
  session: Session;
  dataStream: DataStreamWriter;
  chatId: string;
}

export const uploadSourceFiles = ({ session, dataStream, chatId }: UploadSourceFilesProps) =>
  tool({
    description: 'Upload source files for document creation. This tool first checks if source files exist, and if not, opens a file upload interface where users can select and upload multiple source files (documents, data files, images) that contain information to be extracted and used to fill out document templates.',
    parameters: z.object({
      action: z.enum(['upload', 'check_status']).describe('Whether to upload new source files or check current source files status (defaults to checking status first)'),
    }),
    execute: async ({ action = 'check_status' }) => {
      if (!session?.user?.id) {
        throw new Error('User must be authenticated to manage source files');
      }

      if (action === 'check_status') {
        dataStream.writeData({
          type: 'source-check-start',
          content: 'Checking source files status...',
        });

        try {
          // Check for existing source files in the chat
          const existingFiles = await getFileAttachmentsWithContentByChatId({ chatId });
          const sourceFiles = existingFiles.filter(file => file.fileType === 'source');

          if (sourceFiles.length > 0) {
            const sourceFilesSummary = sourceFiles.map(file => ({
              fileName: file.fileName,
              uploadedAt: file.createdAt,
              contentType: file.contentType,
              size: file.size,
              hasContent: !!file.content,
              contentPreview: file.content?.substring(0, 150) + (file.content && file.content.length > 150 ? '...' : ''),
            }));
            
            dataStream.writeData({
              type: 'source-files-status',
              content: JSON.stringify({
                hasSourceFiles: true,
                fileCount: sourceFiles.length,
                files: sourceFilesSummary,
              }),
            });

            return {
              success: true,
              hasSourceFiles: true,
              fileCount: sourceFiles.length,
              files: sourceFilesSummary,
              message: `Found ${sourceFiles.length} source file(s) already uploaded and ready to use.`,
            };
          } else {
            return {
              success: true,
              hasSourceFiles: false,
              fileCount: 0,
              message: 'No source files found in this chat.',
            };
          }
        } catch (error) {
          throw new Error(`Failed to check source files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Trigger upload interface
        dataStream.writeData({
          type: 'source-files-upload-ui',
          content: JSON.stringify({
            chatId,
            userId: session.user.id,
            acceptedTypes: [
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/pdf',
              'application/msword',
              'text/plain',
              'text/csv',
              'application/json',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
            ],
            maxSize: 10 * 1024 * 1024, // 10MB
            fileType: 'source',
            multiple: true,
          }),
        });

        return {
          success: true,
          action: 'upload_interface_opened',
          userId: session.user.id,
          message: 'Source files upload interface has been opened. Please select your source files.',
          guidance: 'Select documents, data files, or images that contain information you want to extract for your regulatory document. You can select multiple files at once.',
        };
      }
    },
  }); 