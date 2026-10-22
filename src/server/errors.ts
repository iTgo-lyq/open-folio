class AppErrorClass extends Error {
  code: string;
  status: number;
  retryAfter?: string;
  constructor(code: string, message: string, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
// Instrumentation and API bundles share stores, so their errors must share a class.
const globals = globalThis as typeof globalThis & {
  folioAppErrorClass?: typeof AppErrorClass;
};
export const AppError = (globals.folioAppErrorClass ??= AppErrorClass);
export type AppError = AppErrorClass;

export function publicError(e: unknown): AppError {
  return e instanceof AppError
    ? e
    : new AppError(
        "INTERNAL_ERROR",
        "读取暂时失败，请重试或检查服务运行环境。",
      );
}
