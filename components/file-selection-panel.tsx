'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { FileIcon, XIcon } from 'lucide-react';
import { Button } from './ui/button';
import { useState, useRef } from 'react';
import { ACCEPTED_FILE_TYPES } from '@/components/document-copilot-input';

interface FileSelectionPanelProps {
  selectedTemplateFile: File | null;
  setSelectedTemplateFile: (file: File | null) => void;
  selectedSourceFiles: File[];
  setSelectedSourceFiles: (files: File[]) => void;
  isLoading: boolean;
  setInput: (input: string) => void;
}

export function FileSelectionPanel({
  selectedTemplateFile,
  setSelectedTemplateFile,
  selectedSourceFiles,
  setSelectedSourceFiles,
  isLoading,
  setInput
}: FileSelectionPanelProps) {
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const sourceFilesInputRef = useRef<HTMLInputElement>(null);

  const templateAcceptedTypes = [
    ...ACCEPTED_FILE_TYPES.document,
    ...ACCEPTED_FILE_TYPES.image
  ].join(',');

  const sourceAcceptedTypes = [
    ...ACCEPTED_FILE_TYPES.document,
    ...ACCEPTED_FILE_TYPES.data,
    ...ACCEPTED_FILE_TYPES.image
  ].join(',');

  const handleTemplateFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedTemplateFile(file);
      setTemplateModalOpen(false);
      event.target.value = '';
    }
  };

  const handleSourceFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      setSelectedSourceFiles([...selectedSourceFiles, ...files]);
      setSourceModalOpen(false);
      event.target.value = '';
    }
  };

  const removeSourceFile = (fileName: string) => {
    setSelectedSourceFiles(selectedSourceFiles.filter((file: File) => file.name !== fileName));
  };

  const removeTemplateFile = () => {
    setSelectedTemplateFile(null);
    setInput('');
  };

  return (
    <div className="w-64 flex flex-col gap-4 border-l border-border pl-4">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Template</div>
        <Button
          className="w-full justify-start gap-2 text-sm"
          variant="outline"
          onClick={() => setTemplateModalOpen(true)}
          disabled={isLoading}
        >
          <FileIcon size={16} />
          {selectedTemplateFile ? (
            <span className="truncate">{selectedTemplateFile.name}</span>
          ) : (
            "Select Template"
          )}
        </Button>
        {selectedTemplateFile && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => removeTemplateFile()}
          >
            <XIcon size={12} />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Source Files</div>
        <Button
          className="w-full justify-start gap-2 text-sm"
          variant="outline"
          onClick={() => setSourceModalOpen(true)}
          disabled={isLoading}
        >
          <FileIcon size={16} />
          {selectedSourceFiles.length > 0 ? (
            <span className="truncate">{selectedSourceFiles.length} files selected</span>
          ) : (
            "Select Sources"
          )}
        </Button>

        {selectedSourceFiles.length > 0 && (
          <div className="flex flex-col gap-1 mt-2">
            {selectedSourceFiles.map((file) => (
              <div key={file.name} className="flex items-center justify-between text-sm p-2 bg-muted rounded-md">
                <span className="truncate flex-1">{file.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSourceFile(file.name)}
                  className="h-6 w-6 p-0"
                >
                  <XIcon size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="sm:max-w-md">
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
            <Button variant="outline" onClick={() => setTemplateModalOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sourceModalOpen} onOpenChange={setSourceModalOpen}>
        <DialogContent className="sm:max-w-md">
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
            <Button variant="outline" onClick={() => setSourceModalOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 