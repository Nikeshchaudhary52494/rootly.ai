export interface RootlyAIConfig {
  apiKey: string;
  /** Base URL of the rootly.ai API that receives events (POST {serverUrl}/events). Defaults to http://localhost:3001; set it outside local dev. */
  serverUrl?: string;
  serviceName: string;
  environment: string;
  release?: string;
  debug?: boolean;
  enabled?: boolean;
}

export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
}

export interface ErrorEventPayload {
  eventId: string;
  timestamp: string;
  service: {
    name: string;
    environment: string;
    release?: string;
  };
  error: NormalizedError;
}
