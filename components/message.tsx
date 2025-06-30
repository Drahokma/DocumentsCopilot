'use client';

import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon, FileIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import { ToolFileUpload } from './tool-file-upload';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import { useArtifact } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { FileUploadInterface } from './file-upload-interface';

// Extend the Message type to include documentId
interface ExtendedMessage extends Message {
  documentId?: string;
}

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
  index,
}: {
  chatId: string;
  message: ExtendedMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  index: number;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const { setArtifact } = useArtifact();

  // Check if this message contains an artifact (look for the markdown artifact markers)
  const hasArtifact = typeof message.content === 'string' && 
    message.content.includes('<!-- BEGIN_MARKDOWN_ARTIFACT -->') && 
    message.content.includes('<!-- END_MARKDOWN_ARTIFACT -->');

  // Extract artifact title if present
  const getArtifactTitle = (): string => {
    if (!hasArtifact || typeof message.content !== 'string') return 'Document';
    
    const beginIndex = message.content.indexOf('<!-- BEGIN_MARKDOWN_ARTIFACT -->');
    const contentStart = beginIndex + '<!-- BEGIN_MARKDOWN_ARTIFACT -->'.length;
    const titleMatch = message.content.substring(contentStart).match(/# (.*?)(?:\n|$)/);
    
    return titleMatch ? titleMatch[1] : 'Document';
  };
  
  const artifactTitle = getArtifactTitle();
  

  const getArtifactContent = (): string => {
    if (!hasArtifact || typeof message.content !== 'string') return '';
    
    const beginIndex = message.content.indexOf('<!-- BEGIN_MARKDOWN_ARTIFACT -->');
    const endIndex = message.content.indexOf('<!-- END_MARKDOWN_ARTIFACT -->');
    
    if (beginIndex !== -1 && endIndex !== -1) {
      return message.content.substring(
        beginIndex + '<!-- BEGIN_MARKDOWN_ARTIFACT -->'.length,
        endIndex
      ).trim();
    }
    
    return '';
  };

  const isStreamingArtifact = typeof message.content === 'string' && 
    message.content.includes('<!-- BEGIN_MARKDOWN_ARTIFACT -->') && 
    !message.content.includes('<!-- END_MARKDOWN_ARTIFACT -->');

  const handleOpenArtifact = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isReadonly) {
      toast.error('Viewing files in shared chats is currently not supported.');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const boundingBox = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };

    // Create a unique document ID for this artifact if needed
    const documentId = message.documentId || `doc-${message.id}`;

    setArtifact({
      documentId,
      kind: 'text',
      content: getArtifactContent(),
      title: artifactTitle,
      isVisible: true,
      status: 'idle',
      boundingBox,
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}-${index}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div
                data-testid={`message-attachments-${index}`}
                className="flex flex-row justify-end gap-2"
              >
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {message.reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={message.reasoning}
              />
            )}

            {(message.content || message.reasoning) && mode === 'view' && (
              <div className="flex flex-row gap-2 items-start">
                {message.role === 'user' && !isReadonly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        data-testid={`edit-${message.role}-${index}`}
                        variant="ghost"
                        className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                        onClick={() => {
                          setMode('edit');
                        }}
                      >
                        <PencilEditIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit message</TooltipContent>
                  </Tooltip>
                )}

                <div
                  className={cn('flex flex-col gap-4', {
                    'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                      message.role === 'user',
                  })}
                >
                  {isStreamingArtifact ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        className="bg-background cursor-pointer border py-2 px-3 rounded-xl w-fit flex flex-row gap-3 items-start"
                        onClick={handleOpenArtifact}
                      >
                        <div className="text-muted-foreground mt-1">
                          <FileIcon />
                        </div>
                        <div className="text-left">
                          Generating document...
                        </div>
                      </button>
                      <div className="text-sm text-muted-foreground pl-2">
                        Content will appear in the document viewer
                      </div>
                    </div>
                  ) : hasArtifact ? (
                    <button
                      type="button"
                      className="bg-background cursor-pointer border py-2 px-3 rounded-xl w-fit flex flex-row gap-3 items-start"
                      onClick={handleOpenArtifact}
                    >
                      <div className="text-muted-foreground mt-1">
                        <FileIcon />
                      </div>
                      <div className="text-left">
                        {`View document "${artifactTitle}"`}
                      </div>
                    </button>
                  ) : (
                    <Markdown>{message.content as string}</Markdown>
                  )}
                </div>
              </div>
            )}

            {message.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <div className="flex flex-col gap-4">
                {message.toolInvocations.map((toolInvocation) => {
                  const { toolName, toolCallId, state, args } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;

                    return (
                      <div key={toolCallId}>
                        {toolName === 'getWeather' ? (
                          <Weather weatherAtLocation={result} />
                        ) : toolName === 'createDocument' ? (
                          <DocumentPreview
                            isReadonly={isReadonly}
                            result={result}
                          />
                        ) : toolName === 'updateDocument' ? (
                          <DocumentToolResult
                            type="update"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'requestSuggestions' ? (
                          <DocumentToolResult
                            type="request-suggestions"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'uploadTemplate' ? (
                          <div className="mb-4">
                            <div className="text-sm text-muted-foreground mb-2">
                              {result.message}
                            </div>
                            {result.guidance && (
                              <div className="text-sm text-muted-foreground mb-3">
                                {result.guidance}
                              </div>
                            )}
                            {result.action === 'upload_interface_opened' && (
                              <FileUploadInterface
                                chatId={chatId}
                                userId={result.userId || ''}
                                acceptedTypes={[
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                  'application/pdf',
                                  'application/msword',
                                  'text/plain'
                                ]}
                                maxSize={10 * 1024 * 1024}
                                fileType="template"
                                multiple={false}
                                onUploadComplete={() => {
                                  reload();
                                }}
                                onClose={() => {
                                  // Optional: handle close if needed
                                }}
                              />
                            )}
                          </div>
                        ) : toolName === 'uploadSourceFiles' ? (
                          <div className="mb-4">
                            <div className="text-sm text-muted-foreground mb-2">
                              {result.message}
                            </div>
                            {result.guidance && (
                              <div className="text-sm text-muted-foreground mb-3">
                                {result.guidance}
                              </div>
                            )}
                            {result.action === 'upload_interface_opened' && (
                              <FileUploadInterface
                                chatId={chatId}
                                userId={result.userId || ''}
                                acceptedTypes={[
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
                                  'image/webp'
                                ]}
                                maxSize={10 * 1024 * 1024}
                                fileType="source"
                                multiple={true}
                                onUploadComplete={() => {
                                  reload();
                                }}
                                onClose={() => {
                                  // Optional: handle close if needed
                                }}
                              />
                            )}
                          </div>
                        ) : toolName === 'regulatoryDocumentWorkflow' ? (
                          <div className="mb-4">
                            <div className="text-sm text-muted-foreground mb-2">
                              {result.message}
                            </div>
                            {result.workflowSummary && (
                              <div className="mt-2 p-3 bg-muted rounded-lg">
                                <div className="text-sm font-medium mb-2">Workflow Summary:</div>
                                <div className="text-sm space-y-1">
                                  <div>Template: {result.workflowSummary.templateStatus}</div>
                                  <div>Source Files: {result.workflowSummary.sourceFilesStatus}</div>
                                  <div>Document: {result.workflowSummary.documentGenerated ? 'Generated successfully' : 'Generation failed'}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <pre>{JSON.stringify(result, null, 2)}</pre>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'uploadTemplate' || toolName === 'uploadSourceFiles' ? (
                        <div className="text-sm text-muted-foreground">
                          Processing {toolName === 'uploadTemplate' ? 'template' : 'source files'}...
                        </div>
                      ) : toolName === 'regulatoryDocumentWorkflow' ? (
                        <div className="text-sm text-muted-foreground">
                          Starting regulatory document workflow...
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.reasoning !== nextProps.message.reasoning)
      return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (
      !equal(
        prevProps.message.toolInvocations,
        nextProps.message.toolInvocations,
      )
    )
      return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
