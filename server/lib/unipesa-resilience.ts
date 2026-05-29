/**
 * Unipesa resilience layer.
 *
 * Goals:
 *  - Never block the user request for more than ~8s on a provider call.
 *  - No long synchronous retry loops in the request flow. At most one
 *    very short retry on an *immediate* network error (socket reset,
 *    DNS, refused connection) before falling back to a controlled
 *    "PROVIDER_TEMPORARILY_UNAVAILABLE" outcome.
 *  - Lightweight in-process circuit breaker so a known-down provider
 *    does not eat 8s per request: after 5 consecutive failures the
 *    breaker OPENs for 60s, then HALF_OPEN allows a single probe.
 *  - Inbound callbacks must never be gated by the breaker — only
 *    OUTBOUND user-flow calls go through this wrapper.
 *  - Preserve idempotency upstream: this module does not record
 *    ledger entries or transactions, it only governs how a single
 *    provider HTTP call resolves.
 *
 * The wrapper returns a tagged `CallResult<T>` so callers can decide
 * whether to mark a transaction as PENDING (transient failure) versus
 * FAILED (definitive provider rejection). A thrown error from the
 * inner function is treated as `PROVIDER_ERROR` and contributes to
 * the breaker's failure counter.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type FailureKind =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'PROVIDER_ERROR'
  | 'CIRCUIT_OPEN';

export type CallResult<T> =
  | { ok: true; data: T; latencyMs: number; circuitState: CircuitState }
  | {
      ok: false;
      kind: FailureKind;
      error?: string;
      latencyMs: number;
      circuitState: CircuitState;
      retryable: boolean;
    };

/**
 * Lightweight in-process circuit breaker.
 *
 * Process-local on purpose: each Node instance tracks its own breaker
 * state. With a small fleet this is sufficient and avoids needing a
 * shared store. If we ever scale horizontally and want a global view,
 * we can swap this implementation for a Redis-backed one without
 * changing call sites.
 */
class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  /** Returns true when the next call is allowed to leave the process. */
  canCall(now = Date.now()): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (now - this.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow exactly one probe at a time. We optimistically
    // let it through; the result will move us back to CLOSED or OPEN.
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure(): void {
    this.failures += 1;
    if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    // Mutate to HALF_OPEN if cooldown elapsed so reads reflect reality.
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  /** Read-only snapshot for observability. */
  inspect(): { state: CircuitState; failures: number; openedAt: number; cooldownRemainingMs: number } {
    const state = this.getState();
    const cooldownRemainingMs =
      state === 'OPEN' ? Math.max(0, this.cooldownMs - (Date.now() - this.openedAt)) : 0;
    return {
      state,
      failures: this.failures,
      openedAt: this.openedAt,
      cooldownRemainingMs,
    };
  }
}

const breaker = new CircuitBreaker(5, 60_000);

export function getUnipesaCircuitState(): CircuitState {
  return breaker.getState();
}

export function getUnipesaCircuitInfo() {
  return breaker.inspect();
}

/** For tests / admin tooling. */
export function _resetUnipesaBreaker(): void {
  breaker.onSuccess();
}

const DEFAULT_TIMEOUT_MS = 8_000;
const RETRY_TIMEOUT_MS = 2_000;
// An "immediate" network error means the socket failed before we got
// any byte back — well under the user's patience window. Anything
// slower than this we will not retry inside the request flow.
const IMMEDIATE_NETWORK_FAILURE_MS = 500;

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as any;
  return e.code || e.cause?.code || e.errno;
}

function isNetworkError(err: unknown): boolean {
  const code = extractErrorCode(err);
  if (code && NETWORK_ERROR_CODES.has(String(code))) return true;
  const name = (err as any)?.name;
  if (name === 'TypeError' && /fetch failed/i.test(String((err as any)?.message || ''))) {
    // undici surfaces low-level network failures as TypeError("fetch failed")
    return true;
  }
  return false;
}

function isAbortError(err: unknown): boolean {
  return (err as any)?.name === 'AbortError' || extractErrorCode(err) === 'ABORT_ERR';
}

export type ResilientCallOptions = {
  /** Logical name of the provider operation (e.g. "payment_c2b"). */
  operation: string;
  /** Order ID used for log correlation. */
  orderId?: string;
  /** Override the 8s default. Use sparingly. */
  timeoutMs?: number;
  /** Logger compatible with Fastify's `app.log`. Falls back to console. */
  log?: {
    info: (obj: any, msg?: string) => void;
    warn: (obj: any, msg?: string) => void;
    error: (obj: any, msg?: string) => void;
  };
};

type Logger = NonNullable<ResilientCallOptions['log']>;

const consoleLogger: Logger = {
  info: (obj, msg) => console.log('[unipesa]', msg || '', obj),
  warn: (obj, msg) => console.warn('[unipesa]', msg || '', obj),
  error: (obj, msg) => console.error('[unipesa]', msg || '', obj),
};

/**
 * Run a single provider call with a hard timeout.
 *
 * The inner function receives an `AbortSignal` wired to the timeout
 * so callers can plumb it through to `fetch` for an actual transport
 * cancellation (otherwise the underlying request keeps running and
 * holding a connection).
 */
type RawCallResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; kind: FailureKind; error: string; latencyMs: number };

async function callWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<RawCallResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const data = await fn(controller.signal);
    return { ok: true, data, latencyMs: Date.now() - start };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (isAbortError(err) || latencyMs >= timeoutMs - 5) {
      return { ok: false, kind: 'TIMEOUT', error: 'timeout', latencyMs };
    }
    if (isNetworkError(err)) {
      return {
        ok: false,
        kind: 'NETWORK',
        error: extractErrorCode(err) || (err as Error)?.message || 'network',
        latencyMs,
      };
    }
    return {
      ok: false,
      kind: 'PROVIDER_ERROR',
      error: (err as Error)?.message || String(err),
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a Unipesa call with timeout + circuit breaker + at-most-one
 * very short retry on immediate network failure.
 *
 * The caller passes a function that performs the actual HTTP request.
 * That function MUST honour the provided `AbortSignal` so that the
 * 8s timeout can interrupt an in-flight socket.
 *
 * Returns a tagged result. The caller decides whether to:
 *   - apply the success path (`ok: true`)
 *   - mark the transaction PENDING (`!ok && retryable`)
 *   - mark the transaction FAILED (`!ok && !retryable`)
 *
 * The breaker is updated for every outcome: a success closes it, any
 * failure increments the counter, and `CIRCUIT_OPEN` short-circuits
 * without contacting the provider at all.
 */
export async function callUnipesaResilient<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: ResilientCallOptions,
): Promise<CallResult<T>> {
  const log = opts.log || consoleLogger;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stateBefore = breaker.getState();

  if (!breaker.canCall()) {
    log.warn(
      {
        provider: 'unipesa',
        operation: opts.operation,
        orderId: opts.orderId,
        circuitState: stateBefore,
        latencyMs: 0,
        errorCode: 'CIRCUIT_OPEN',
      },
      'unipesa call short-circuited',
    );
    return {
      ok: false,
      kind: 'CIRCUIT_OPEN',
      error: 'circuit_open',
      latencyMs: 0,
      circuitState: stateBefore,
      retryable: true,
    };
  }

  const first: RawCallResult<T> = await callWithTimeout(fn, timeoutMs);
  if (first.ok === true) {
    breaker.onSuccess();
    log.info(
      {
        provider: 'unipesa',
        operation: opts.operation,
        orderId: opts.orderId,
        circuitState: breaker.getState(),
        latencyMs: first.latencyMs,
      },
      'unipesa call ok',
    );
    return {
      ok: true,
      data: first.data,
      latencyMs: first.latencyMs,
      circuitState: breaker.getState(),
    };
  }

  // One short retry, but only on a *fast* network error. Timeouts and
  // provider 5xx are NOT retried inline — they go straight to PENDING.
  const shouldRetryInline =
    first.kind === 'NETWORK' && first.latencyMs <= IMMEDIATE_NETWORK_FAILURE_MS;

  if (shouldRetryInline) {
    log.warn(
      {
        provider: 'unipesa',
        operation: opts.operation,
        orderId: opts.orderId,
        circuitState: breaker.getState(),
        latencyMs: first.latencyMs,
        errorCode: first.error,
      },
      'unipesa immediate network error — single short retry',
    );
    const second: RawCallResult<T> = await callWithTimeout(fn, RETRY_TIMEOUT_MS);
    if (second.ok === true) {
      breaker.onSuccess();
      log.info(
        {
          provider: 'unipesa',
          operation: opts.operation,
          orderId: opts.orderId,
          circuitState: breaker.getState(),
          latencyMs: first.latencyMs + second.latencyMs,
        },
        'unipesa call ok after retry',
      );
      return {
        ok: true,
        data: second.data,
        latencyMs: first.latencyMs + second.latencyMs,
        circuitState: breaker.getState(),
      };
    }
    // Retry also failed — fall through with merged latency.
    breaker.onFailure();
    log.error(
      {
        provider: 'unipesa',
        operation: opts.operation,
        orderId: opts.orderId,
        circuitState: breaker.getState(),
        latencyMs: first.latencyMs + second.latencyMs,
        errorCode: second.error,
      },
      'unipesa call failed after retry',
    );
    return {
      ok: false,
      kind: second.kind,
      error: second.error,
      latencyMs: first.latencyMs + second.latencyMs,
      circuitState: breaker.getState(),
      retryable: true,
    };
  }

  breaker.onFailure();
  log.error(
    {
      provider: 'unipesa',
      operation: opts.operation,
      orderId: opts.orderId,
      circuitState: breaker.getState(),
      latencyMs: first.latencyMs,
      errorCode: first.error,
    },
    'unipesa call failed',
  );
  // TIMEOUT and NETWORK are transient → retryable (mark PENDING).
  // PROVIDER_ERROR is treated as retryable by default because Unipesa
  // wraps both transport and business errors into the same shape;
  // reconciliation will resolve the real outcome via /status.
  return {
    ok: false,
    kind: first.kind,
    error: first.error,
    latencyMs: first.latencyMs,
    circuitState: breaker.getState(),
    retryable: true,
  };
}
