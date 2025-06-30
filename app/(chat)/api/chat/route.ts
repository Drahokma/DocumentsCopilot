import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
  saveDocument,
  getFileAttachmentsWithContentByChatId,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { uploadTemplate } from '@/lib/ai/tools/upload-template';
import { uploadSourceFiles } from '@/lib/ai/tools/upload-source-files';
import { regulatoryDocumentWorkflow } from '@/lib/ai/tools/regulatory-document-workflow';
import { isProductionEnvironment } from '@/lib/constants';
import { NextResponse } from 'next/server';
import { myProvider } from '@/lib/ai/providers';
import { getUserById, createOAuthUser } from '@/lib/db/queries';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      id,
      messages,
      selectedChatModel,
      templateContent,
      sourceFiles,
    }: {
      id: string;
      messages: Array<Message>;
      selectedChatModel: string;
      templateContent: string | null;
      sourceFiles: Array<{ name: string; content: string }>;
    } = body;

    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Ensure user exists in database
    try {
      const existingUser = await getUserById(session.user.id);
      if (!existingUser) {
        // Create OAuth user if doesn't exist
        console.log('Creating OAuth user:', session.user.email, 'with ID:', session.user.id);
        await createOAuthUser(session.user.id, session.user.email!);
      }
    } catch (error) {
      console.error('Error ensuring user exists:', error);
      return new Response('User validation failed', { status: 500 });
    }

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });

      try {
        await saveChat({ id, userId: session.user.id, title });
        console.log('chat saved');
      } catch (error) {
        console.error('Failed to save chat:', error);
        return new Response('Failed to save chat', { status: 500 });
      }
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    await saveMessages({
      messages: [{ 
        ...userMessage, 
        createdAt: new Date(), 
        chatId: id,
      }],
    });

    // Load uploaded files from database
    let dbTemplateContent = '';
    let dbSourceFiles: Array<{ name: string; content: string }> = [];
    
    try {
      const uploadedFiles = await getFileAttachmentsWithContentByChatId({ chatId: id });
      
      // Get template files
      const templateFiles = uploadedFiles.filter(file => file.fileType === 'template' && file.content);
      if (templateFiles.length > 0) {
        // Use the most recent template
        const latestTemplate = templateFiles[0];
        dbTemplateContent = latestTemplate.content || '';
        console.log('Loaded template from database:', latestTemplate.fileName);
      }
      
      // Get source files
      const sourceFileAttachments = uploadedFiles.filter(file => file.fileType === 'source' && file.content);
      dbSourceFiles = sourceFileAttachments.map(file => ({
        name: file.fileName,
        content: file.content || ''
      }));
      console.log('Loaded source files from database:', dbSourceFiles.length);
      
    } catch (error) {
      console.error('Failed to load uploaded files from database:', error);
    }

    // Combine database files with request body files (request body takes precedence)
    const finalTemplateContent = templateContent || dbTemplateContent;
    const finalSourceFiles = sourceFiles?.length > 0 ? sourceFiles : dbSourceFiles;

    // Build file context if available
    let fileContext = '';
    if (finalTemplateContent) {
      fileContext += `Template Content:\n${finalTemplateContent}\n\n`;
    }
    
    if (finalSourceFiles?.length > 0) {
      fileContext += 'Source Files:\n';
      finalSourceFiles.forEach(file => {
        fileContext += `File: ${file.name}\n${file.content}\n\n`;
      });
    }

    // Prepare document data for createDocument tool
    const documentData = {
      templateContent: finalTemplateContent || '',
      sourceFiles: finalSourceFiles || []
    };

    console.log('documentData', documentData);

    // Always use the reasoning model when files are present
    const modelToUse = finalTemplateContent || finalSourceFiles?.length > 0 
      ? 'chat-model-reasoning' 
      : selectedChatModel;

    console.log('modelToUse', modelToUse);

    // Unified approach for all chats
    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(modelToUse),
          system: fileContext 
            ? `${systemPrompt({ selectedChatModel: modelToUse })}\n\nContext:\n${fileContext}`
            : systemPrompt({ selectedChatModel: modelToUse }),
          messages,
          maxSteps: 5,
          experimental_activeTools: [
            'getWeather',
            'createDocument',
            'updateDocument',
            'requestSuggestions',
            'uploadTemplate',
            'uploadSourceFiles',
            'regulatoryDocumentWorkflow',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ 
              session, 
              dataStream, 
              documentData,
            }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
            uploadTemplate: uploadTemplate({ 
              session, 
              dataStream, 
              chatId: id 
            }),
            uploadSourceFiles: uploadSourceFiles({ 
              session, 
              dataStream, 
              chatId: id 
            }),
            regulatoryDocumentWorkflow: regulatoryDocumentWorkflow({ 
              session, 
              dataStream, 
              chatId: id 
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            if (session.user?.id) {
              try {
                const sanitizedResponseMessages = sanitizeResponseMessages({
                  messages: response.messages,
                  reasoning,
                });

                const processedMessages = await Promise.all(sanitizedResponseMessages.map(async (message) => {
                  if (typeof message.content === 'string') {
                    const beginIndex = message.content.indexOf('<!-- BEGIN_MARKDOWN_ARTIFACT -->');
                    const endIndex = message.content.indexOf('<!-- END_MARKDOWN_ARTIFACT -->');
                    
                    if (beginIndex !== -1 && endIndex !== -1) {
                      // Extract artifact content
                      const artifactContent = message.content.substring(
                        beginIndex + '<!-- BEGIN_MARKDOWN_ARTIFACT -->'.length,
                        endIndex
                      ).trim();
                      
                      const titleMatch = artifactContent.match(/^#\s+(.+)$/m);
                      const title = titleMatch ? titleMatch[1] : 'Document';
                      
                      const documentId = generateUUID();
                      
                      if (session.user?.id) {
                        await saveDocument({
                          id: documentId,
                          title: title,
                          content: artifactContent,
                          kind: 'text',
                          userId: session.user.id,
                        });
                      }
                      
                      return {
                        ...message,
                        documentId: documentId
                      };
                    }
                  }
                  return {
                    ...message,
                    documentId: null
                  };
                }));

                await saveMessages({
                  messages: processedMessages.map((message) => ({
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(),
                  })),
                });
              } catch (error) {
                console.error('Failed to save chat:', error);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error) => {
        console.error('Chat API error:', error);
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
