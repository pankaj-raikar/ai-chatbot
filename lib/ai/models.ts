import { allmodels } from './openai-compatible-models';

export const DEFAULT_CHAT_MODEL: string = 'chat-model';

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

// Generate additional chat models from the allmodels array
const additionalModels = allmodels.map(model => ({
  id: model.id,
  name: model.base_model,
  description: `${model.provider} - ${model.base_model}`,
}));

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Chat model',
    description: 'Primary model for all-purpose chat',
  },
  {
    id: 'chat-model-reasoning',
    name: 'Reasoning model',
    description: 'Uses advanced reasoning',
  },
  ...additionalModels
];
