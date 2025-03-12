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

    // Extract content from file
    let content;
    if (fileType === 'source') {
      if (file.type === 'text/plain' || file.type === 'application/json' || file.type === 'text/csv') {
        content = await file.text();
      } else if (file.type === 'application/pdf') {
        content = await file.text(); // Basic text extraction for now
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
        content = result.value;
      }
    }
    
    // Save file attachment in database, only process content for source files
    await saveFileAttachment({
      chatId,
      userId: session.user.id ?? '',
      fileName: file.name,
      fileType,
      contentType: file.type,
      url: blob.url,
      size: file.size,
      content: fileType === 'source' ? content : undefined, // Only save content for source files
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
