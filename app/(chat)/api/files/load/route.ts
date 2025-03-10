import { auth } from '@/app/(auth)/auth';
import { getFileAttachmentsByChatId } from '@/lib/db/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('Missing chatId', { status: 400 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const fileAttachments = await getFileAttachmentsByChatId({ chatId });

  return Response.json(fileAttachments, { status: 200 });
}
