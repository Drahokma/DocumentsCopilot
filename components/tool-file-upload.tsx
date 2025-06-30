'use client';

import { useState, useEffect } from 'react';
import { FileUploadInterface } from './file-upload-interface';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CheckCircleIcon, FileIcon, CalendarIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ToolFileUploadProps {
  type: 'template-upload-ui' | 'source-files-upload-ui' | 'template-status' | 'source-files-status';
  content: string;
  onComplete?: () => void;
}

export function ToolFileUpload({ type, content, onComplete }: ToolFileUploadProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    try {
      const parsedContent = JSON.parse(content);
      setData(parsedContent);
      
      if (type === 'template-upload-ui' || type === 'source-files-upload-ui') {
        setShowUpload(true);
      }
    } catch (error) {
      console.error('Failed to parse tool content:', error);
    }
  }, [content, type]);

  const handleUploadComplete = (uploadedFiles: Array<{ fileName: string; url: string }>) => {
    setShowUpload(false);
    onComplete?.();
  };

  const handleClose = () => {
    setShowUpload(false);
    onComplete?.();
  };

  if (!data) return null;

  // Show upload interface
  if (showUpload && (type === 'template-upload-ui' || type === 'source-files-upload-ui')) {
    return (
      <div className="my-4">
        <FileUploadInterface
          chatId={data.chatId}
          userId={data.userId}
          acceptedTypes={data.acceptedTypes}
          maxSize={data.maxSize}
          fileType={data.fileType}
          multiple={data.multiple}
          onUploadComplete={handleUploadComplete}
          onClose={handleClose}
        />
      </div>
    );
  }

  // Show template status
  if (type === 'template-status') {
    return (
      <Card className="my-4 max-w-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Template Found</CardTitle>
          </div>
          <CardDescription>
            Your template is ready for document creation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-3 p-3 border rounded-lg bg-green-50">
            <FileIcon className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="font-medium">{data.fileName}</p>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <CalendarIcon className="h-3 w-3" />
                <span>
                  Uploaded {formatDistanceToNow(new Date(data.uploadedAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <Badge variant="secondary">Template</Badge>
          </div>
          
          {data.contentPreview && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Content Preview:</p>
              <p className="text-sm text-muted-foreground">{data.contentPreview}</p>
            </div>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowUpload(true)}
            className="w-full"
          >
            Upload Different Template
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show source files status
  if (type === 'source-files-status') {
    return (
      <Card className="my-4 max-w-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">
              Source Files Found ({data.fileCount})
            </CardTitle>
          </div>
          <CardDescription>
            Your source files are ready for information extraction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {data.files.map((file: any, index: number) => (
              <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">{file.fileName}</p>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <CalendarIcon className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}
                      </span>
                    </div>
                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                  {file.contentPreview && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {file.contentPreview}
                    </p>
                  )}
                </div>
                <Badge variant="secondary">Source</Badge>
              </div>
            ))}
          </div>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowUpload(true)}
            className="w-full"
          >
            Upload Additional Source Files
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
} 