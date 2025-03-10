import { embed, embedMany } from 'ai';
import { azure } from '@ai-sdk/azure';
import { cosineDistance, desc, gt, sql, eq, isNotNull, inArray, and } from 'drizzle-orm';
import { embeddings } from '@/lib/db/schema';
import { db } from '@/lib/db/index';
import { myProvider } from './providers';
import { fileAttachment } from '@/lib/db/schema';

export class RecursiveCharacterTextSplitter {
  private separators: string[];
  private chunkSize: number;
  private chunkOverlap: number;
  private lengthFunction: (text: string) => number;

  constructor({
    separators = ['\n\n', '\n', ' ', ''],
    chunkSize = 1000,
    chunkOverlap = 200,
    lengthFunction = (text: string) => text.length,
  } = {}) {
    this.separators = separators;
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.lengthFunction = lengthFunction;
  }

  private mergeSplits(splits: string[], separator: string): string[] {
    const docs: string[] = [];
    let currentDoc: string[] = [];
    let total = 0;

    for (const split of splits) {
      const length = this.lengthFunction(split);
      if (total + length + (currentDoc.length > 0 ? separator.length : 0) > this.chunkSize && currentDoc.length > 0) {
        // If we've exceeded chunk size, save current doc and reset
        docs.push(currentDoc.join(separator));
        
        // Keep last part of previous chunk for overlap
        const lastPieces = currentDoc.slice(-(this.chunkOverlap / this.chunkSize * currentDoc.length));
        currentDoc = lastPieces;
        total = lastPieces.reduce((sum, piece) => sum + this.lengthFunction(piece), 0);
      }
      currentDoc.push(split);
      total += length + (currentDoc.length > 0 ? separator.length : 0);
    }

    if (currentDoc.length > 0) {
      docs.push(currentDoc.join(separator));
    }

    return docs;
  }

  private splitText(text: string, separator: string): string[] {
    const splits = text.split(separator).filter(s => s.trim().length > 0);
    return this.mergeSplits(splits, separator);
  }

  public createDocuments(text: string): string[] {
    let finalChunks: string[] = [text];

    for (const separator of this.separators) {
      const tempChunks: string[] = [];
      for (const chunk of finalChunks) {
        const newChunks = this.splitText(chunk, separator);
        tempChunks.push(...newChunks);
      }
      finalChunks = tempChunks;
    }

    // Ensure no chunk exceeds the maximum size
    return finalChunks.map(chunk => 
      chunk.length > this.chunkSize 
        ? chunk.slice(0, this.chunkSize) 
        : chunk
    );
  }
}

export const generateEmbeddings = async (
    value: string,
  ): Promise<Array<{ embedding: number[]; content: string }>> => {
    // Normalize text before splitting
    const normalizedValue = value
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
      
    const splitter = new RecursiveCharacterTextSplitter();
    const chunks = splitter.createDocuments(normalizedValue);
    
    const { embeddings } = await embedMany({
      model: myProvider.textEmbeddingModel('embedding-model'),
      values: chunks,
    });
    
    return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
  };

export const generateEmbedding = async (value: string): Promise<number[]> => {
  // Normalize text by:
  // 1. Replace multiple spaces with single space
  // 2. Replace newlines with spaces
  // 3. Normalize Unicode characters
  const input = value
    .normalize('NFKC')  // Normalize Unicode characters
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim();  // Remove leading/trailing spaces
    
  const { embedding } = await embed({
    model: myProvider.textEmbeddingModel('embedding-model'),
    value: input,
  });
  return embedding;
};

export const findRelevantContent = async (userQuery: string, chatId: string) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
  
  // First, get all resource IDs connected to this chat through file attachments
  const chatResourceIds = await db
    .select({ resourceId: fileAttachment.resourceId })
    .from(fileAttachment)
    .where(
      and(
        eq(fileAttachment.chatId, chatId),
        isNotNull(fileAttachment.resourceId)
      )
    );

  console.log('chatResourceIds', chatResourceIds);
  
  // If no resources are attached to this chat, return empty results
  if (chatResourceIds.length === 0) {
    return [];
  }
  
  // Extract just the resource IDs into an array, filtering out any null values
  const resourceIds = chatResourceIds
    .map((row: { resourceId: string | null }) => row.resourceId)
    .filter((id): id is string => id !== null);

  console.log('resourceIds', resourceIds);
  
  // Calculate similarity and filter by both similarity threshold and resource IDs
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  console.log('similarity', similarity);
  
  const similarContent = await db
    .select({ 
      content: embeddings.content, 
      similarity,
      resourceId: embeddings.resourceId 
    })
    .from(embeddings)
    .where(and(
      gt(similarity, 0.3),
      inArray(embeddings.resourceId, resourceIds)
    ))
    .orderBy(desc(similarity))
    .limit(10);

  console.log('similarContent', similarContent);

  return similarContent;
};