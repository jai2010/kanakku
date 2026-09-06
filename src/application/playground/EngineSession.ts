import { EngineService } from './EngineService';

let session: EngineService | undefined;

export function getEngineSession(): EngineService {
  if (session === undefined) {
    session = EngineService.createLive();
  }
  return session;
}

export function resetEngineSession(): EngineService {
  session = EngineService.createLive();
  return session;
}
