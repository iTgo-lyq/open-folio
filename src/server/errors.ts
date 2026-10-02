export class AppError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 503) { super(message); this.code = code; this.status = status; }
}
export function publicError(e: unknown): AppError { return e instanceof AppError ? e : new AppError('INTERNAL_ERROR', '读取暂时失败，请重试或检查服务运行环境。'); }
