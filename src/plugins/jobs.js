import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

function nowIso() {
  return new Date().toISOString();
}

class JobRunner {
  #queue = [];
  #jobs = new Map();
  #running = 0;
  #concurrency;

  constructor({ concurrency = 2 } = {}) {
    this.#concurrency = concurrency;
  }

  list() {
    return Array.from(this.#jobs.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  get(jobId) {
    return this.#jobs.get(jobId) ?? null;
  }

  update(jobId, patch) {
    const job = this.get(jobId);
    if (!job) return null;
    Object.assign(job, patch);
    return job;
  }

  enqueue({ type, input }, handler) {
    const job = {
      id: randomUUID(),
      type,
      status: 'QUEUED',
      input,
      progress: { stage: 'queued' },
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
    };

    this.#jobs.set(job.id, job);
    this.#queue.push({ job, handler });
    this.#drain();
    return job;
  }

  async #drain() {
    while (this.#running < this.#concurrency && this.#queue.length > 0) {
      const item = this.#queue.shift();
      this.#running += 1;
      this.#run(item).finally(() => {
        this.#running -= 1;
        this.#drain();
      });
    }
  }

  async #run({ job, handler }) {
    const abortController = new AbortController();
    this.update(job.id, { status: 'RUNNING', startedAt: nowIso(), progress: { stage: 'running' } });

    try {
      const result = await handler({ job, signal: abortController.signal, update: (patch) => this.update(job.id, patch) });
      this.update(job.id, {
        status: 'SUCCEEDED',
        finishedAt: nowIso(),
        result,
        progress: { stage: 'done' },
      });
    } catch (error) {
      this.update(job.id, {
        status: 'FAILED',
        finishedAt: nowIso(),
        error: { message: error?.message || 'Job failed' },
        progress: { stage: 'failed' },
      });
    }
  }
}

export const jobsPlugin = fp(async (app) => {
  const concurrency = app.config.JOBS_CONCURRENCY;
  app.decorate('jobs', new JobRunner({ concurrency: Number.isFinite(concurrency) ? concurrency : 2 }));
});
