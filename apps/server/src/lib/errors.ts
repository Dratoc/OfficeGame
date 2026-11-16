export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = 'Tienes que iniciar sesión') => new HttpError(401, msg);
export const forbidden = (msg = 'No tienes acceso a esto') => new HttpError(403, msg);
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
