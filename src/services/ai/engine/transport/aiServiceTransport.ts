import { AITransport, TransportRequest, StreamEvent } from './types';
import { AIService } from '../../aiService';
import { FetchTransport } from './fetchTransport';

export class AIServiceTransport implements AITransport {
  public readonly id = 'ai-service';

  public stream(
    request: TransportRequest,
    onEvent: (event: StreamEvent) => void
  ): { abort: () => void; promise: Promise<void> } {
    if (request.provider && request.model && request.messages) {
      return AIService.stream(request.provider, request.model, request.messages, onEvent, undefined, request.generationOptions);
    }
    return new FetchTransport().stream(request, onEvent);
  }
}
