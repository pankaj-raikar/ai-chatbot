import {
  UIMessage,
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  getTrailingMessageId,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    console.log('=== Chat Request Started ===');
    const {
      id,
      messages,
      selectedChatModel,
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
    } = await request.json();

    console.log('Request Data:', {
      id,
      model: selectedChatModel,
      messageCount: messages.length,
      timestamp: new Date().toISOString()
    });

    const session = await auth();
    console.log('Auth Status:', {
      hasSession: !!session,
      userId: session?.user?.id
    });

    if (!session || !session.user || !session.user.id) {
      console.log('Auth Failed: Unauthorized');
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);
    console.log('User Message:', {
      messageId: userMessage?.id,
      hasMessage: !!userMessage
    });

    if (!userMessage) {
      console.log('Error: No user message found');
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });
    console.log('Chat Status:', {
      exists: !!chat,
      chatId: id,
      userId: chat?.userId
    });

    if (!chat) {
      console.log('Creating new chat...');
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });
      console.log('Generated Title:', title);

      await saveChat({ id, userId: session.user.id, title });
      console.log('New chat saved');
    } else {
      if (chat.userId !== session.user.id) {
        console.log('Error: Unauthorized chat access');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    console.log('Saving user message...');
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: userMessage.id,
          role: 'user',
          parts: userMessage.parts,
          attachments: userMessage.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });
    console.log('User message saved');

    console.log('Starting stream response...');
    return createDataStreamResponse({
      execute: (dataStream) => {
        console.log('Streaming with model:', selectedChatModel);
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          // system: systemPrompt({ selectedChatModel }),
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response }) => {
            console.log('Stream finished, saving assistant response...');
            if (session.user?.id) {
              try {
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
                  ),
                });

                if (!assistantId) {
                  console.error('Error: No assistant message found');
                  throw new Error('No assistant message found!');
                }

                const [, assistantMessage] = appendResponseMessages({
                  messages: [userMessage],
                  responseMessages: response.messages,
                });

                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });
                console.log('Assistant response saved successfully');
              } catch (error) {
                console.error('Failed to save chat:', error);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error) => {
        console.error('Stream error:', error);
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('Request error:', error);
    return new Response('An error occurred while processing your request!', {
      status: 404,
    });
  }
}

export async function DELETE(request: Request) {
  console.log('=== Delete Request Started ===');
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  console.log('Delete Request:', {
    id,
    timestamp: new Date().toISOString()
  });

  if (!id) {
    console.log('Error: No chat ID provided');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  console.log('Auth Status:', {
    hasSession: !!session,
    userId: session?.user?.id
  });

  if (!session || !session.user) {
    console.log('Error: Unauthorized delete request');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });
    console.log('Chat Status:', {
      exists: !!chat,
      chatId: id,
      userId: chat?.userId
    });

    if (chat.userId !== session.user.id) {
      console.log('Error: Unauthorized chat deletion');
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });
    console.log('Chat deleted successfully');
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
