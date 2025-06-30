'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { DocumentCopilotInput } from './document-copilot-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { getFileContent } from '@/lib/utils/file-helpers';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<File[]>([]);

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
    error,
    data,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      mutate('/api/history');
    },
    onError: (error) => {
      console.error('Chat error:', error);
      toast.error(`An error occurred: ${error.message || 'Please try again'}`);
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  const handleMessageSubmit = async (event?: { preventDefault?: () => void }) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    try {
      // Extract content from template and source files
      let templateContent = null;
      if (selectedTemplateFile) {
        templateContent = await getFileContent(selectedTemplateFile);
      }

      const sourceFiles = await Promise.all(
        selectedSourceFiles.map(async (file) => ({
          name: file.name,
          content: await getFileContent(file)
        }))
      );

      // Pass file content to handleSubmit
      const options = {
        body: {
          templateContent,
          sourceFiles
        }
      }

      console.log('options', options);

      handleSubmit(event, options);
    } catch (error) {
      console.error('Error submitting message:', error);
      toast.error(`Failed to send message: ${error instanceof Error ? error.message : 'Please try again'}`);
    }
  };

  return (
    <>
      <div className="flex h-dvh">
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <ChatHeader
            chatId={id}
            selectedModelId={selectedChatModel}
            selectedVisibilityType={selectedVisibilityType}
            isReadonly={isReadonly}
          />
          
          <Messages
            chatId={id}
            isLoading={isLoading}
            votes={votes}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            isArtifactVisible={isArtifactVisible}
          />
          <form className="sticky bottom-0 mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
            {!isReadonly && (
              <DocumentCopilotInput
                chatId={id}
                input={input}
                setInput={setInput}
                handleSubmit={handleMessageSubmit}
                isLoading={isLoading}
                stop={stop}
                attachments={attachments}
                setAttachments={setAttachments}
                messages={messages}
                setMessages={setMessages}
                append={append}
              />
            )}
          </form>
        </div>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleMessageSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}
