import type {
  ExecutionContext,
  ExportedHandler,
  ScheduledController,
} from '@cloudflare/workers-types';
import type { WorkerEnv } from './env';
import { createWorkerRuntime } from './runtime';

const handler: ExportedHandler<WorkerEnv> = {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return createWorkerRuntime(env).fetch(request);
  },

  scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(createWorkerRuntime(env).scheduled(controller.cron));
  },
};

export default handler;
