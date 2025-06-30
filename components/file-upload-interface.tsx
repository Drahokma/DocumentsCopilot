'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { toast } from 'sonner';
import { FileIcon, UploadIcon, XIcon, CheckCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadInterfaceProps {
  chatId: string;
  userId: string;
  acceptedTypes: string[];
  maxSize: number;
  fileType: 'template' | 'source';
  multiple?: boolean;
  onUploadComplete?: (uploadedFiles: Array<{ fileName: string; url: string }>) => void;
  onClose?: () => void;
}

export function FileUploadInterface({
  chatId,
  userId,
  acceptedTypes,
  maxSize,
  fileType,
  multiple = false,
  onUploadComplete,
  onClose,
}: FileUploadInterfaceProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ fileName: string; url: string }>>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeDescription = () => {
    if (fileType === 'template') {
      return 'Select a template file that defines the structure and format for your regulatory document';
    }
    return 'Select source files containing information to extract for your regulatory document';
  };

  const getAcceptedTypesDescription = () => {
    const typeMap: Record<string, string> = {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
      'application/pdf': 'PDF',
      'application/msword': 'Word (.doc)',
      'text/plain': 'Text (.txt)',
      'text/csv': 'CSV',
      'application/json': 'JSON',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
      'image/gif': 'GIF',
      'image/webp': 'WebP',
    };

    return acceptedTypes.map(type => typeMap[type] || type).join(', ');
  };

  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return `File type ${file.type} is not supported`;
    }
    if (file.size > maxSize) {
      return `File size must be less than ${formatFileSize(maxSize)}`;
    }
    return null;
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    const validFiles: File[] = [];
    
    for (const file of newFiles) {
      const error = validateFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
        continue;
      }
      validFiles.push(file);
    }

    if (!multiple && validFiles.length > 1) {
      toast.error(`Only one ${fileType} file can be selected`);
      return;
    }

    if (!multiple) {
      setSelectedFiles(validFiles.slice(0, 1));
    } else {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    const uploaded: Array<{ fileName: string; url: string }> = [];

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileType', fileType);
        formData.append('chatId', chatId);

        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        const response = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to upload ${file.name}: ${errorText}`);
        }

        const result = await response.json();
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        
        uploaded.push({
          fileName: file.name,
          url: result.url,
        });

        toast.success(`${file.name} uploaded successfully`);
      }

      setUploadedFiles(uploaded);
      setSelectedFiles([]);
      onUploadComplete?.(uploaded);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress({});
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, []);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">
            Upload {fileType === 'template' ? 'Template' : 'Source Files'}
          </CardTitle>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{getFileTypeDescription()}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Drop Zone */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            dragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="space-y-2">
            <p className="text-lg font-medium">
              Drop files here or{' '}
              <Button
                variant="link"
                className="p-0 h-auto font-medium"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </Button>
            </p>
            <p className="text-sm text-muted-foreground">
              Accepted types: {getAcceptedTypesDescription()}
            </p>
            <p className="text-sm text-muted-foreground">
              Maximum size: {formatFileSize(maxSize)}
            </p>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={acceptedTypes.join(',')}
          multiple={multiple}
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Selected Files</h4>
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {uploadProgress[file.name] !== undefined && (
                    <div className="w-20">
                      <Progress value={uploadProgress[file.name]} className="h-2" />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    disabled={uploading}
                    className="h-8 w-8 p-0"
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Uploaded Files */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-green-600">Successfully Uploaded</h4>
            {uploadedFiles.map((file, index) => (
              <div
                key={`uploaded-${file.fileName}-${index}`}
                className="flex items-center space-x-3 p-3 border rounded-lg bg-green-50"
              >
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">{file.fileName}</p>
                  <p className="text-sm text-muted-foreground">Upload complete</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Button */}
        {selectedFiles.length > 0 && (
          <Button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon className="h-4 w-4 mr-2" />
                Upload {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
              </>
            )}
          </Button>
        )}

        {/* File Type Badge */}
        <div className="flex justify-center">
          <Badge variant="secondary">
            {fileType === 'template' ? 'Template File' : 'Source Files'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
} 