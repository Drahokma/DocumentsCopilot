'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, ArtifactKind } from './artifact';
import { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';
import { Message } from '@/lib/db/schema';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'message-metadata';
  content: string | Suggestion;
  messageId?: string;
  documentId?: string;
};

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream } = useChat({ id });
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const { messages, setMessages } = useChat({ id });
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }
      console.log('delta', delta);


      if (delta.type === 'text-delta' && messages?.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && typeof lastMessage.content === 'string') {
          const hasBeginMarker = lastMessage.content.includes('<!-- BEGIN_MARKDOWN_ARTIFACT -->');
          const hasEndMarker = lastMessage.content.includes('<!-- END_MARKDOWN_ARTIFACT -->');
          
          console.log('hasBeginMarker', hasBeginMarker);
          console.log('hasEndMarker', hasEndMarker);
          if (hasBeginMarker && !hasEndMarker) {
            const beginMarkerIndex = lastMessage.content.indexOf('<!-- BEGIN_MARKDOWN_ARTIFACT -->');
            const contentAfterMarker = lastMessage.content.substring(
              beginMarkerIndex + '<!-- BEGIN_MARKDOWN_ARTIFACT -->'.length
            );
            
            setArtifact((draftArtifact) => ({
              ...draftArtifact,
              documentId: lastMessage.id,
              kind: 'text',
              content: contentAfterMarker,
              isVisible: true,
              status: 'streaming',
            }));
          }
        }
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          case 'message-metadata':
            if ('messageId' in delta && 'documentId' in delta) {
              const documentId = typeof delta.documentId === 'string' && delta.documentId.startsWith('doc-')
                ? delta.documentId.replace('doc-', '')
                : delta.documentId;
              
              setMessages((prevMessages) => 
                prevMessages.map((msg) => {
                  if (msg.id === delta.messageId) {
                    return {
                      ...msg,
                      documentId
                    };
                  }
                  return msg;
                })
              );
            }
            return draftArtifact;

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact, setMessages, messages]);

  return null;
}
