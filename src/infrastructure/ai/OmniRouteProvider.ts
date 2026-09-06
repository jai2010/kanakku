import { OpenAICompatibleProvider, OpenAICompatibleProviderOptions } from './OpenAICompatibleProvider';

export type OmniRouteProviderOptions = Omit<OpenAICompatibleProviderOptions, 'name'>;

export class OmniRouteProvider extends OpenAICompatibleProvider {
  constructor(options: OmniRouteProviderOptions) {
    super({
      ...options,
      name: 'omniroute'
    });
  }
}
