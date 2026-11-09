import {modelImageInput} from './modelImageInput';
import {resolveModelCapability,requestOutputCap} from './modelCapabilities';
import {inspectModelCapacity,assertModelCapacity,type CapacityReceipt} from './modelCapacity';
import { supportsNativeContinuation } from './boundedContinuation';
import { AIProviderConfig } from '../../types/provider';
import { EngineMessage, StreamTextOptions } from './engine/core/types';
import { TransportRequest } from './engine/transport/types';
import {supportsThinkingToggle} from './thinkingPolicy';
import {structuredMessages,structuredChatOptions,supportsDeepSeekThinking} from './structuredRequestPolicy';

export interface PreparedRequest {
  transportRequest: TransportRequest;
  estimatedInputChars: number;
  capacity:CapacityReceipt;
}

export function encodeModelRequest(options: StreamTextOptions): PreparedRequest {
  const { provider, model, temperature = 0.7, jsonSchema } = options;
  const maxTokens=requestOutputCap(provider,model,options.maxTokens??8192);
  // Validate every image before building any request or changing transport state.
  const images=new Map(options.messages.map(message=>[message,modelImageInput(provider,model,message)]));
  const messages=structuredMessages(options.messages,jsonSchema);
  const imageOf=(message:EngineMessage)=>images.get(message)??modelImageInput(provider,model,message);
  const capacity=inspectModelCapacity(messages,maxTokens,resolveModelCapability(provider,model),jsonSchema);
  try{options.onCapacity?.(structuredClone(capacity));}catch{/* receipt reporting never grants request authority */}
  assertModelCapacity(capacity);
  let url = '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let bodyJson: Record<string, unknown> = {};

  const estimatedInputChars = messages.reduce((acc, m) => acc + (m.content?.length || 0) + (m.imageUrl ? 1000 : 0), 0);

  if (provider.protocol === 'openai_compatible') {
    const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
    url = cleanBase.endsWith('/chat/completions')
      ? cleanBase
      : cleanBase.endsWith('/v1')
      ? `${cleanBase}/chat/completions`
      : `${cleanBase}/chat/completions`;

    if (provider.apiKey) {
      const rawKey = provider.apiKey.trim().replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${rawKey}`;
    }

    const openAiMessages = messages.map((m) => {
      if (m.imageUrl) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: m.imageUrl } }
          ]
        };
      }
      return { role: m.role, content: m.content, ...(m.partial && supportsNativeContinuation(provider, model) && m === messages.at(-1) && m.role === 'assistant' ? { partial: true } : {}) };
    });

    const body: Record<string, unknown> = {
      model,
      messages: openAiMessages,
      ...(openAiMessages.some(m => 'partial' in m) ? { enable_thinking: false } : {}),
      ...(options.enableThinking!==undefined&&supportsThinkingToggle(provider,model)?{enable_thinking:options.enableThinking}:{}),
      ...(options.enableThinking!==undefined&&supportsDeepSeekThinking(provider,model)?{thinking:{type:options.enableThinking?'enabled':'disabled'}}:{}),
      stream: true,
      temperature,
      max_tokens: maxTokens
    };

    Object.assign(body,structuredChatOptions(provider,model,jsonSchema,options.enableThinking));

    if (provider.id === 'prov-openai') {
      body.stream_options = { include_usage: true };
    }

    bodyJson = body;
  } else if (provider.protocol === 'anthropic') {
    const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
    url = cleanBase.endsWith('/messages')
      ? cleanBase
      : cleanBase.endsWith('/v1')
      ? `${cleanBase}/messages`
      : `${cleanBase}/v1/messages`;

    const rawKey = (provider.apiKey || '').trim().replace(/^Bearer\s+/i, '');
    if (rawKey) {
      headers['x-api-key'] = rawKey;
      headers['Authorization'] = `Bearer ${rawKey}`;
    }
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';

    const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
    const nonSystem = messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const image=imageOf(m);
        if(image)return {role:m.role,content:[{type:'text',text:m.content},{type:'image',source:image.kind==='base64'
          ?{type:'base64',media_type:image.mime,data:image.data}:{type:'url',url:image.url}}]};
        return { role: m.role, content: m.content };
      });

    const anthropicMessages = nonSystem.length > 0 ? nonSystem : [{ role: 'user', content: 'hello' }];

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      stream: true,
      max_tokens: maxTokens,
      temperature
    };

    if (systemMsg.trim()) {
      body.system = systemMsg.trim();
    }

    if (jsonSchema) {
      body.tools = [
        {
          name: 'output_json',
          description: 'Extract structured data adhering to JSON schema',
          input_schema: jsonSchema
        }
      ];
      body.tool_choice = { type: 'tool', name: 'output_json' };
    }

    bodyJson = body;
  } else if (provider.protocol === 'gemini') {
    const keyParam = provider.apiKey ? `?key=${provider.apiKey.trim()}&alt=sse` : '?alt=sse';
    const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
    url = `${cleanBase}/models/${model}:streamGenerateContent${keyParam}`;

    const contents = messages.map((m) => {
      const parts: any[] = [{ text: m.content }];
      const image=imageOf(m);
      if(image?.kind==='base64')parts.push({inlineData:{mimeType:image.mime,data:image.data}});
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };

    if (jsonSchema) {
      (body.generationConfig as any).responseMimeType = 'application/json';
      (body.generationConfig as any).responseSchema = jsonSchema;
    }

    bodyJson = body;
  } else if (provider.protocol === 'ollama_native') {
    const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
    url = `${cleanBase}/api/chat`;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => {const image=imageOf(m);return {role:m.role,content:m.content,...(image?.kind==='base64'?{images:[image.data]}:{})};}),
      stream: true,
      options: { temperature, num_predict: maxTokens }
    };

    if (jsonSchema) {
      body.format = 'json';
    }

    bodyJson = body;
  }

  return {
    transportRequest: {
      url,
      method: 'POST',
      headers,
      body: bodyJson,
      signal: options.signal,
      provider: options.provider,
      model: options.model,
      messages,
      generationOptions: { maxTokens, temperature,...(jsonSchema?{jsonSchema}:{}),...(options.enableThinking!==undefined?{enableThinking:options.enableThinking}:{}), eventProtocol:'typed' }
    },
    estimatedInputChars,capacity
  };
}
