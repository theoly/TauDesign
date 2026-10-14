import { AIProviderConfig } from '../../../../types/provider';
import { EngineMessage, StreamTextOptions } from './types';
import { TransportRequest } from '../transport/types';

export interface PreparedRequest {
  transportRequest: TransportRequest;
  estimatedInputChars: number;
}

export function prepareModelRequest(options: StreamTextOptions): PreparedRequest {
  const { provider, model, messages, temperature = 0.7, maxTokens = 8192, jsonSchema } = options;
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
      : `${cleanBase}/v1/chat/completions`;

    if (provider.apiKey) {
      const rawKey = provider.apiKey.trim().replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${rawKey}`;
    }

    const openAiMessages = messages.map((m) => {
      if (m.imageUrl && m.imageUrl.startsWith('data:')) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: m.imageUrl } }
          ]
        };
      }
      return { role: m.role, content: m.content };
    });

    const body: Record<string, unknown> = {
      model,
      messages: openAiMessages,
      stream: true,
      temperature,
      max_tokens: maxTokens
    };

    if (jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'extracted_schema',
          strict: true,
          schema: jsonSchema
        }
      };
    }

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
        if (m.imageUrl && m.imageUrl.startsWith('data:')) {
          const match = m.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              role: m.role,
              content: [
                { type: 'text', text: m.content },
                {
                  type: 'image',
                  source: { type: 'base64', media_type: match[1], data: match[2] }
                }
              ]
            };
          }
        }
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
      if (m.imageUrl && m.imageUrl.startsWith('data:')) {
        const match = m.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: { mimeType: match[1], data: match[2] }
          });
        }
      }
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
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
      messages: options.messages
    },
    estimatedInputChars
  };
}
