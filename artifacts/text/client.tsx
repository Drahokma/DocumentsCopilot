import { Artifact, ExportHandler, ExportFormat, ExportOptions } from '@/components/create-artifact';
import { DiffView } from '@/components/diffview';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { Editor } from '@/components/text-editor';
import {
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
  PdfIcon,
  DocIcon,
} from '@/components/icons';
import { Suggestion } from '@/lib/db/schema';
import { toast } from 'sonner';
import { getSuggestions } from '../actions';


interface TextArtifactMetadata {
  suggestions: Array<Suggestion>;
}

const textExportHandler: ExportHandler = {
  exportDocument: async (format: ExportFormat, content: string, options?: ExportOptions) => {
    try {
      const blob = new Blob([content], { type: format === 'pdf' ? 'application/pdf' : 'application/msword' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = options?.filename || `document.${format}`;
      
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Document exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(`Failed to export document as ${format.toUpperCase()}`);
    }
  }
};

export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    setMetadata({
      suggestions,
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'suggestion') {
      setMetadata((metadata) => {
        return {
          suggestions: [
            ...metadata.suggestions,
            streamPart.content as Suggestion,
          ],
        };
      });
    }

    console.log('streamPart', streamPart);
  
    if (streamPart.type === 'text-delta') {
      setArtifact((draftArtifact) => {
        if (streamPart.messageId && draftArtifact.documentId === streamPart.messageId) {
          return {
            ...draftArtifact,
            content: draftArtifact.content + (streamPart.content as string),
            isVisible: true,
            status: 'streaming',
          };
        }
        
        const updatedContent = draftArtifact.content + (streamPart.content as string);
        return {
          ...draftArtifact,
          content: updatedContent,
          isVisible: true,
          status: 'streaming',
        };
      });
    }
    
    if (streamPart.type === 'finish') {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        status: 'idle',
      }));
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === 'diff') {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView oldContent={oldContent} newContent={newContent} />;
    }

    return (
      <>
        <div className="flex flex-row py-8 md:p-20 px-4">
          <Editor
            content={content}
            suggestions={metadata ? metadata.suggestions : []}
            isCurrentVersion={isCurrentVersion}
            currentVersionIndex={currentVersionIndex}
            status={status}
            onSaveContent={onSaveContent}
          />

          {metadata &&
          metadata.suggestions &&
          metadata.suggestions.length > 0 ? (
            <div className="md:hidden h-dvh w-12 shrink-0" />
          ) : null}
        </div>
      </>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: 'View changes',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('toggle');
      },
      isDisabled: ({ currentVersionIndex, setMetadata }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy to clipboard',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard!');
      },
    },
    {
      icon: <PdfIcon />,
      description: 'Export as PDF',
      onClick: ({ content }) => {
        if (textExportHandler) {
          textExportHandler.exportDocument('pdf', content, {
            filename: 'document.pdf',
            includeMetadata: false
          });
        }
      },
    },
    {
      icon: <DocIcon />,
      description: 'Export as DOC',
      onClick: ({ content }) => {
        if (textExportHandler) {
          textExportHandler.exportDocument('doc', content, {
            filename: 'document.doc',
            includeMetadata: false
          });
        }
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: 'Add final polish',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.',
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add suggestions you have that could improve the writing.',
        });
      },
    },
  ],
  exportHandler: textExportHandler,
});
