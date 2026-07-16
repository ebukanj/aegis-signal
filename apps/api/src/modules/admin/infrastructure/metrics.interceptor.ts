import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";
import { PrometheusService } from "../application/metrics/prometheus.service";

/**
 * Counts every HTTP response so `/metrics` can report traffic and error rate.
 *
 * It records on both success and error — a route that only counted successes would
 * report a healthy request rate while every call 500s, which is the exact moment the
 * metric needs to be truthful. The `tap` fires after the response is resolved, so the
 * status code is real, not assumed.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly prometheus: PrometheusService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method;

    return next.handle().pipe(
      tap({
        next: () => this.prometheus.recordHttp(method, response.statusCode),
        error: (err: { status?: number }) => this.prometheus.recordHttp(method, err?.status ?? 500),
      }),
    );
  }
}
