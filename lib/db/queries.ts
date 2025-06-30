import 'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { and, asc, desc, eq, gt, gte, inArray } from 'drizzle-orm';


import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  type Message,
  message,
  vote,
  fileAttachment,
  type FileAttachment,
  resources,
  NewResourceParams,
  insertResourceSchema,
} from './schema';
import { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '@/lib/utils';
import { generateEmbeddings } from '../ai/embeddings';
import { embeddings as embeddingsTable } from './schema';
import { db } from './index';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle



export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database');
    throw error;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const [foundUser] = await db.select().from(user).where(eq(user.id, id));
    return foundUser || null;
  } catch (error) {
    console.error('Failed to get user by id from database');
    throw error;
  }
}

export async function createUser(email: string, password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  try {
    return await db.insert(user).values({ email, password: hash });
  } catch (error) {
    console.error('Failed to create user in database');
    throw error;
  }
}

export async function createOAuthUser(id: string, email: string) {
  try {
    return await db.insert(user).values({ 
      id,
      email, 
      password: null // OAuth users don't have passwords
    });
  } catch (error) {
    console.error('Failed to create OAuth user in database');
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
    });
  } catch (error) {
    console.error('Failed to save chat in database');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(chat)
      .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    // Use an upsert operation to handle duplicate IDs gracefully
    for (const msg of messages) {
      await db.insert(message).values(msg).onConflictDoUpdate({
        target: message.id,
        set: {
          content: msg.content,
          createdAt: msg.createdAt,
        },
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db.insert(document).values({
      id,
      title,
      kind,
      content,
      userId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save document in database');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

export async function createResourceFromFile(content: string) {
  try {
    // Sanitize content to remove null bytes and other problematic characters
    const sanitizedContent = content
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters except \n, \r, \t
      .trim();

    if (!sanitizedContent) {
      throw new Error('Content is empty after sanitization');
    }

    const { content: validatedContent } = insertResourceSchema.parse({ content: sanitizedContent });

    const [resource] = await db
      .insert(resources)
      .values({ content: validatedContent })
      .returning();

    const embeddings = await generateEmbeddings(validatedContent);
    await db.insert(embeddingsTable).values(
      embeddings.map(embedding => ({
        resourceId: resource.id,
        ...embedding,
      })),
    );

    return resource.id;
  } catch (error) {
    console.error('Failed to create resource from file', error);
    throw error;
  }
}

export async function saveFileAttachment({
  chatId,
  userId,
  fileName,
  fileType,
  contentType,
  url,
  size,
  content,
}: {
  chatId: string;
  userId: string;
  fileName: string;
  fileType: 'template' | 'source';
  contentType: string;
  url: string;
  size: number;
  content?: string;
}) {
  try {
    // Check if chat exists
    const existingChat = await getChatById({ id: chatId });
    
    // If chat doesn't exist, create it
    if (!existingChat) {
      await saveChat({
        id: chatId,
        userId,
        title: `File Upload: ${fileName}`, // Default title, can be updated later
      });
    }

    // Create a resource if content is provided
    let resourceId = null;
    if (content) {
      resourceId = await createResourceFromFile(content);
    }

    return await db.insert(fileAttachment).values({
      id: generateUUID(),
      chatId,
      userId,
      fileName,
      fileType,
      contentType,
      url,
      size,
      resourceId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save file attachment in database', error);
    throw error;
  }
}

export async function getFileAttachmentsByChatId({
  chatId,
}: {
  chatId: string;
}) {
  try {
    return await db
      .select()
      .from(fileAttachment)
      .where(eq(fileAttachment.chatId, chatId))
      .orderBy(fileAttachment.createdAt);
  } catch (error) {
    console.error('Failed to get file attachments from database');
    throw error;
  }
}

export async function getFileAttachmentsWithContentByChatId({
  chatId,
}: {
  chatId: string;
}) {
  try {
    return await db
      .select({
        id: fileAttachment.id,
        chatId: fileAttachment.chatId,
        userId: fileAttachment.userId,
        fileName: fileAttachment.fileName,
        fileType: fileAttachment.fileType,
        contentType: fileAttachment.contentType,
        url: fileAttachment.url,
        size: fileAttachment.size,
        resourceId: fileAttachment.resourceId,
        createdAt: fileAttachment.createdAt,
        content: resources.content,
      })
      .from(fileAttachment)
      .leftJoin(resources, eq(fileAttachment.resourceId, resources.id))
      .where(eq(fileAttachment.chatId, chatId))
      .orderBy(fileAttachment.createdAt);
  } catch (error) {
    console.error('Failed to get file attachments with content from database');
    throw error;
  }
}

export const createResource = async (input: NewResourceParams) => {
  try {
    const { content } = insertResourceSchema.parse(input);

    const [resource] = await db
      .insert(resources)
      .values({ content })
      .returning();

    const embeddings = await generateEmbeddings(content);
    await db.insert(embeddingsTable).values(
      embeddings.map(embedding => ({
        resourceId: resource.id,
        ...embedding,
      })),
    );

    return 'Resource successfully created and embedded.';
  } catch (error) {
    return error instanceof Error && error.message.length > 0
      ? error.message
      : 'Error, please try again.';
  }
};
