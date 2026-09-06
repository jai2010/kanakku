import { PlaygroundService } from './PlaygroundService';

let session: PlaygroundService | undefined;

export function getPlaygroundSession(): PlaygroundService {
  if (session === undefined) {
    session = PlaygroundService.createDemo();
  }
  return session;
}

export function resetPlaygroundSession(): PlaygroundService {
  session = PlaygroundService.createDemo();
  return session;
}
