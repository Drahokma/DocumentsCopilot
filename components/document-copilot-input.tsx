'use client';

import type { Attachment, ChatRequestOptions, CreateMessage, Message } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { FileIcon, PaperclipIcon, ArrowUpIcon, StopIcon, LoaderIcon } from './icons';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Badge } from './ui/badge';
import { X as XIcon } from 'lucide-react';
import { generateUUID } from '@/lib/utils';

// Extend the Attachment type to include metadata
interface ExtendedAttachment extends Attachment {
  metadata?: {
    fileType?: 'template' | 'source';
    size?: number;
    originalName?: string;
  };
}

// File types accepted for upload - accepting all common file types
const ACCEPTED_FILE_TYPES = {
  document: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/pdf',
    'application/msword',
    'text/plain',
  ],
  data: [
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  ],
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ]
};

export function DocumentCopilotInput({
  chatId,
  input,
  setInput,
  handleSubmit,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
}: {
  chatId: string;
  input: string;
  setInput: (input: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: React.Dispatch<React.SetStateAction<Array<Attachment>>>;
  messages: Array<Message>;
  setMessages: React.Dispatch<React.SetStateAction<Array<Message>>>;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  handleSubmit: (
    event?: {
      preventDefault?: () => void;
    },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const sourceFilesInputRef = useRef<HTMLInputElement>(null);
  
  // State for modal dialogs
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  
  // State for selected files before upload
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<File[]>([]);
  
  // State for files being uploaded
  const [uploadingFiles, setUploadingFiles] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  // Handle template file selection
  const handleTemplateFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedTemplateFile(file);
      
      // Auto-close the dialog after selection
      setTemplateModalOpen(false);
      
      // Set input to indicate file is ready
      setInput(`Template file ${file.name} selected. Send a message to process it.`);
    }
  };

  // Handle source files selection
  const handleSourceFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      setSelectedSourceFiles(prev => [...prev, ...files]);
      
      // Auto-close the dialog after selection
      setSourceModalOpen(false);
      
      // Set input to indicate files are ready
      const fileNames = files.map(f => f.name).join(', ');
      setInput(`Selected ${files.length} source file${files.length > 1 ? 's' : ''}: ${fileNames}. Send a message to process ${files.length > 1 ? 'them' : 'it'}.`);
    }
  };

  // Remove a source file from selection
  const removeSourceFile = (fileName: string) => {
    setSelectedSourceFiles(prev => prev.filter(file => file.name !== fileName));
    
    // Update input message if needed
    if (selectedSourceFiles.length <= 1) {
      setInput('');
    } else {
      const remainingFiles = selectedSourceFiles.filter(file => file.name !== fileName);
      const fileNames = remainingFiles.map(f => f.name).join(', ');
      setInput(`I've selected ${remainingFiles.length} source file${remainingFiles.length > 1 ? 's' : ''}: ${fileNames}`);
    }
  };

  // Remove template file
  const removeTemplateFile = () => {
    setSelectedTemplateFile(null);
    setInput('');
  };

  // Open template file dialog
  const openTemplateDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTemplateModalOpen(true);
  };

  // Open source files dialog
  const openSourceDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSourceModalOpen(true);
  };

  // All accepted file types for template
  const templateAcceptedTypes = [
    ...ACCEPTED_FILE_TYPES.document,
    ...ACCEPTED_FILE_TYPES.image
  ].join(',');

  // All accepted file types for source files
  const sourceAcceptedTypes = [
    ...ACCEPTED_FILE_TYPES.document,
    ...ACCEPTED_FILE_TYPES.data,
    ...ACCEPTED_FILE_TYPES.image
  ].join(',');

  // Add this function after the existing functions (around line 171)
  // This will handle file uploads and update the attachments
  const uploadFile = async (file: File, fileType: 'template' | 'source') => {
    try {
      // Mark file as uploading
      setUploadingFiles(prev => ({...prev, [file.name]: true}));
      
      // Create form data for the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', fileType);
      formData.append('chatId', chatId);
      
      // Add a system message showing upload progress
      const uploadingMessageId = generateUUID();
      await append({
        id: uploadingMessageId,
        role: 'system',
        content: `📤 **Uploading ${fileType} file:** ${file.name}...`,
      });
      
      // Upload the file
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Create an attachment with the file data
      const newAttachment: ExtendedAttachment = {
        name: file.name,
        url: data.url,
        contentType: file.type,
        metadata: {
          fileType: fileType,
          size: file.size,
          originalName: file.name
        }
      };
      
      // Add to attachments
      setAttachments(prev => [...prev, newAttachment]);
      
      // Add a system message showing processing status
      const processingMessageId = `processing-${file.name}-${Date.now()}`;
      await append({
        id: processingMessageId,
        role: 'system',
        content: `🔄 **Processing ${fileType} file:** ${file.name}...`,
      });
      
      // Simulate vectorization process (in a real app, this would be a server response)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Add a system message showing completion
      const completionMessageId = `completion-${file.name}-${Date.now()}`;
      await append({
        id: completionMessageId,
        role: 'system',
        content: `✅ **${fileType === 'template' ? 'Template' : 'Source'} file ready!**
${file.name} has been processed successfully. You can now ask questions about it.`,
      });
      
      // Mark file as done uploading
      setUploadingFiles(prev => {
        const updated = {...prev};
        delete updated[file.name];
        return updated;
      });
      
      // Clear the input field
      setInput('');
      
      return newAttachment;
    } catch (error) {
      console.error('Error uploading file:', error);
      
      // Add a system message showing error
      const errorMessageId = `error-${file.name}-${Date.now()}`;
      await append({
        id: errorMessageId,
        role: 'system',
        content: `❌ **Upload failed:** ${file.name}
There was an error processing your file. Please try again.`,
      });
      
      toast.error(`Failed to upload ${file.name}`);
      
      // Mark file as done uploading (with error)
      setUploadingFiles(prev => {
        const updated = {...prev};
        delete updated[file.name];
        return updated;
      });
      
      // Clear the input field
      setInput('');
      
      return null;
    }
  };

  // Add this before the return statement to wrap handleSubmit
  const handleFormSubmit = async (event?: { preventDefault?: () => void }) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    // If there are files to upload, process them first
    if (selectedTemplateFile || selectedSourceFiles.length > 0) {
      // Set loading state for all files
      const filesToProcess = [
        ...(selectedTemplateFile ? [selectedTemplateFile] : []), 
        ...selectedSourceFiles
      ];
      
      const fileMap: {[key: string]: boolean} = {};
      filesToProcess.forEach(file => {
        fileMap[file.name] = true;
      });
      setUploadingFiles(fileMap);
      
      // Upload template file if present
      if (selectedTemplateFile) {
        await uploadFile(selectedTemplateFile, 'template');
      }
      
      // Upload source files if present
      for (const file of selectedSourceFiles) {
        await uploadFile(file, 'source');
      }
      
      // All files uploaded, now submit the message with better formatting
      const templateText = selectedTemplateFile ? `📄 **Template:** ${selectedTemplateFile.name}\n` : '';
      const sourceText = selectedSourceFiles.length > 0 ? 
        `📚 **Source files:** ${selectedSourceFiles.map(f => f.name).join(', ')}\n` : '';
      
      setInput(`${templateText}${sourceText}${input.trim() ? input.trim() : 'Please analyze these files.'}`);
    }
    
    // Call the original handleSubmit
    handleSubmit(event);
  };

  return (
    <div className="relative w-full flex flex-col gap-4">
      <div className="flex flex-row gap-2 justify-between items-end">
        <div className="flex flex-row gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="rounded-md py-2 px-3 h-fit dark:border-zinc-700"
                onClick={openTemplateDialog}
                disabled={isLoading}
                variant="outline"
              >
                <FileIcon size={18} />
                <span className="ml-2">Template</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select a template document</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="rounded-md py-2 px-3 h-fit dark:border-zinc-700"
                onClick={openSourceDialog}
                disabled={isLoading}
                variant="outline"
              >
                <FileIcon size={18} />
                <span className="ml-2">Source Files</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select source files</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Display selected files */}
      {(selectedTemplateFile || selectedSourceFiles.length > 0) && (
        <div className="flex flex-col gap-3">
          {/* Template file section */}
          {selectedTemplateFile && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium flex items-center">
                <span className="mr-2">Template File</span>
                <Badge variant="outline" className="text-xs px-2 py-0">1</Badge>
              </div>
              <div className="flex flex-row gap-2 overflow-x-auto">
                <div className="flex items-center justify-between p-3 bg-muted rounded-md border border-muted-foreground/20">
                  <div className="flex items-center gap-2">
                    <FileIcon size={16} />
                    <span className="text-xs font-medium truncate max-w-40">{selectedTemplateFile.name}</span>
                    {uploadingFiles[selectedTemplateFile.name] && (
                      <div className="animate-spin ml-2">
                        <LoaderIcon size={12} />
                      </div>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={removeTemplateFile}
                    className="h-6 w-6 p-0 ml-2"
                  >
                    <XIcon size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Source files section */}
          {selectedSourceFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium flex items-center">
                <span className="mr-2">Source Files</span>
                <Badge variant="outline" className="text-xs px-2 py-0">
                  {selectedSourceFiles.length}
                </Badge>
              </div>
              <div className="flex flex-row gap-2 overflow-x-auto flex-wrap">
                {selectedSourceFiles.map((file) => (
                  <div key={file.name} className="flex items-center justify-between p-3 bg-muted rounded-md border border-muted-foreground/20">
                    <div className="flex items-center gap-2">
                      <FileIcon size={16} />
                      <span className="text-xs font-medium truncate max-w-40">{file.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeSourceFile(file.name)}
                      className="h-6 w-6 p-0 ml-2"
                    >
                      <XIcon size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-row gap-2 items-end">
        <Textarea
          ref={textareaRef}
          placeholder="Send a message..."
          value={input}
          onChange={handleInput}
          className="min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700"
          rows={2}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (isLoading) {
                toast.error('Please wait for the model to finish its response!');
              } else {
                handleFormSubmit();
              }
            }
          }}
        />
        
        <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
          {isLoading ? (
            <Button
              className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
              onClick={(event) => {
                event.preventDefault();
                stop();
              }}
            >
              <StopIcon size={14} />
            </Button>
          ) : (
            <Button
              className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
              onClick={(event) => {
                event.preventDefault();
                handleFormSubmit();
              }}
              disabled={input.length === 0 && selectedTemplateFile === null && selectedSourceFiles.length === 0}
            >
              <ArrowUpIcon size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Template File Selection Modal */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="sm:max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Select Template File</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <input
              type="file"
              ref={templateFileInputRef}
              accept={templateAcceptedTypes}
              onChange={handleTemplateFileSelect}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90"
            />
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                setTemplateModalOpen(false);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Source Files Selection Modal */}
      <Dialog open={sourceModalOpen} onOpenChange={setSourceModalOpen}>
        <DialogContent className="sm:max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Select Source Files</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <input
              type="file"
              ref={sourceFilesInputRef}
              accept={sourceAcceptedTypes}
              onChange={handleSourceFilesSelect}
              multiple
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90"
            />
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                setSourceModalOpen(false);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}