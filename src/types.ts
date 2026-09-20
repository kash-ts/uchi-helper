export type MessageType = 'success' | 'error';

export interface InterceptedResponse<T = unknown> {
  url: string;
  data: T;
  response: Response;
}

export interface GatewaySessionData {
  data?: {
    generation?: {
      name?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
