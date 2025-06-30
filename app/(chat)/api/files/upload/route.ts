import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { saveFileAttachment } from '@/lib/db/queries';
import mammoth from 'mammoth';

// Define accepted file types to match the frontend
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

// Flatten the accepted types into a single array
const ALLOWED_MIME_TYPES = [
  ...ACCEPTED_FILE_TYPES.document,
  ...ACCEPTED_FILE_TYPES.data,
  ...ACCEPTED_FILE_TYPES.image
];

// Function to sanitize content and remove null bytes
function sanitizeContent(content: string): string {
  if (!content) return '';
  
  // Remove null bytes and other problematic characters
  return content
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters except \n, \r, \t
    .trim();
}

// Function to extract content from different file types
async function extractFileContent(file: File): Promise<string | null> {
  try {
    switch (file.type) {
      case 'text/plain':
      case 'application/json':
      case 'text/csv':
        const textContent = await file.text();
        return sanitizeContent(textContent);
        
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
        return sanitizeContent(result.value);
        
      case 'application/pdf':
        try {
          // Dynamic import to avoid test file loading issues
          const pdfParse = await import('pdf-parse');
          const pdfBuffer = await file.arrayBuffer();
          const pdfData = await pdfParse.default(Buffer.from(pdfBuffer));
          return sanitizeContent(pdfData.text);
        } catch (pdfError) {
          console.error(`Error extracting PDF content from ${file.name}:`, pdfError);
          return null;
        }
        
      case 'application/msword':
        // Legacy .doc files - would need additional library for proper extraction
        console.log(`Legacy Word file ${file.name} uploaded - content extraction skipped`);
        return null;
        
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        // Excel files - would need additional library for proper extraction
        console.log(`Excel file ${file.name} uploaded - content extraction skipped`);
        return null;
        
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
        // Images don't have extractable text content
        console.log(`Image file ${file.name} uploaded - no text content to extract`);
        return null;
        
      default:
        console.log(`Unsupported file type ${file.type} for content extraction`);
        return null;
    }
  } catch (error) {
    console.error(`Error extracting content from ${file.name}:`, error);
    return null;
  }
}

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    .refine((file) => ALLOWED_MIME_TYPES.includes(file.type), {
      message: `File type not supported. Supported types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    }),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as 'template' | 'source';
    const chatId = formData.get('chatId') as string;
    
    if (!file || !chatId || !fileType) {
      return new Response('Missing required fields', { status: 400 });
    }
    
    // Validate file size and type
    if (file.size > 10 * 1024 * 1024) {
      return new Response('File size should be less than 10MB', { status: 400 });
    }
    
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return new Response(`File type not supported. Supported types: ${ALLOWED_MIME_TYPES.join(', ')}`, { status: 400 });
    }
    
    // Upload file to blob storage
    const blob = await put(`chats/${chatId}/${file.name}`, file, {
      access: 'public',
    });

    // Extract content from file for both source and template files, using safe extraction
    let content: string | undefined;
    if (fileType === 'source' || fileType === 'template') {
      const extractedContent = await extractFileContent(file);
      content = extractedContent || undefined;
    }
    
    // Save file attachment in database
    await saveFileAttachment({
      chatId,
      userId: session.user.id ?? '',
      fileName: file.name,
      fileType,
      contentType: file.type,
      url: blob.url,
      size: file.size,
      content, // Will be undefined for files without extractable content
    });
    
    return NextResponse.json({
      url: blob.url,
      success: true
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return new Response('Error uploading file', { status: 500 });
  }
}
