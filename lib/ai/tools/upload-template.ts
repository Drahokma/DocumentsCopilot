import { generateUUID } from '@/lib/utils';
import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { getFileAttachmentsWithContentByChatId } from '@/lib/db/queries';

interface UploadTemplateProps {
  session: Session;
  dataStream: DataStreamWriter;
  chatId: string;
}

export const uploadTemplate = ({ session, dataStream, chatId }: UploadTemplateProps) =>
  tool({
    description: 'Upload a template file for document creation. This tool first checks if a template exists, and if not, opens a file upload interface where users can select and upload template files (.docx, .pdf, .txt) that define the structure and format for regulatory documents.',
    parameters: z.object({
      action: z.enum(['upload', 'check_status']).describe('Whether to upload a new template or check current template status (defaults to checking status first)'),
    }),
    execute: async ({ action = 'check_status' }) => {
      if (!session?.user?.id) {
        throw new Error('User must be authenticated to manage templates');
      }

      if (action === 'check_status') {
        dataStream.writeData({
          type: 'template-check-start',
          content: 'Checking template status...',
        });

        try {
          // Check for existing templates in the chat
          const existingFiles = await getFileAttachmentsWithContentByChatId({ chatId });
          const templateFiles = existingFiles.filter(file => file.fileType === 'template');

          if (templateFiles.length > 0) {
            const latestTemplate = templateFiles[0]; // Most recent template
            
            dataStream.writeData({
              type: 'template-status',
              content: JSON.stringify({
                hasTemplate: true,
                fileName: latestTemplate.fileName,
                uploadedAt: latestTemplate.createdAt,
                contentPreview: latestTemplate.content?.substring(0, 200) + (latestTemplate.content && latestTemplate.content.length > 200 ? '...' : ''),
              }),
            });

            return {
              success: true,
              hasTemplate: true,
              templateFile: latestTemplate.fileName,
              uploadedAt: latestTemplate.createdAt,
              message: `Template "${latestTemplate.fileName}" is already uploaded and ready to use.`,
            };
          } else {
            return {
              success: true,
              hasTemplate: false,
              message: 'No template file found in this chat.',
            };
          }
        } catch (error) {
          throw new Error(`Failed to check template status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Trigger upload interface
        dataStream.writeData({
          type: 'template-upload-ui',
          content: JSON.stringify({
            chatId,
            userId: session.user.id,
            acceptedTypes: [
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/pdf',
              'application/msword',
              'text/plain',
            ],
            maxSize: 10 * 1024 * 1024, // 10MB
            fileType: 'template',
          }),
        });

        return {
          success: true,
          action: 'upload_interface_opened',
          userId: session.user.id,
          message: 'Template upload interface has been opened. Please select your template file.',
          guidance: 'Select a Word document (.docx), PDF file, or text file that contains the structure and format you want to use for your regulatory document.',
        };
      }
    },
  }); 