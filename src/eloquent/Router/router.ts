import { Router, RequestHandler } from 'express';
import {resolveMiddleware} from "@/eloquent/Middleware/middleware";

export type HandlerOrAlias = RequestHandler | string | Array<RequestHandler | string>;
export type GroupOptions = { prefix?: string; middleware?: RequestHandler | RequestHandler[] | string | string[] };

export class RouterBuilder {
  private router: Router;
  private prefixStack: string[] = [''];
  private middlewareStack: RequestHandler[][] = [[]];

  constructor() {
    this.router = Router();
  }

  private normalizePath(parts: string[]) {
    const full = parts
      .filter(Boolean)
      .map(p => p.replace(/(^\/+|\/+$)/g, ''))
      .join('/');
    return '/' + full;
  }

  private currentPrefix() {
    return this.prefixStack.join('');
  }

  private currentMiddlewares(): RequestHandler[] {
    return this.middlewareStack.reduce<RequestHandler[]>((acc, cur) => acc.concat(cur || []), []);
  }

  group(options: GroupOptions, cb: (rb: RouterBuilder) => void) {
    const prefix = options.prefix || '';
    const raw = options.middleware ? (Array.isArray(options.middleware) ? options.middleware : [options.middleware]) : [] as any[];
    // resolve middleware strings to request handlers and flatten arrays
    const mw: RequestHandler[] = [];
    for (const r of raw) {
      const resolved = resolveMiddleware(r as any);
      if (Array.isArray(resolved)) mw.push(...resolved as RequestHandler[]);
      else mw.push(resolved as RequestHandler);
    }
    this.prefixStack.push(prefix);
    this.middlewareStack.push(mw);
    try {
      cb(this);
    } finally {
      this.prefixStack.pop();
      this.middlewareStack.pop();
    }
  }

  private register(method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'all', path: string, ...handlers: HandlerOrAlias[]) {
    const prefix = this.currentPrefix();
    const fullPath = this.normalizePath([prefix, path]);
    const middlewares = this.currentMiddlewares();
    // resolve any handler that may be a string or array of strings (middleware aliases)
    const resolvedHandlers: RequestHandler[] = [];
    for (const h of handlers as any[]) {
      // each handler may be a function, a string alias, or an array of aliases/functions
      const r = resolveMiddleware(h as any);
      if (Array.isArray(r)) resolvedHandlers.push(...r as RequestHandler[]);
      else resolvedHandlers.push(r as RequestHandler);
    }

    (this.router as any)[method](fullPath, ...middlewares, ...resolvedHandlers);
  }

  get(path: string, ...handlers: HandlerOrAlias[]) { this.register('get', path, ...handlers); }
  post(path: string, ...handlers: HandlerOrAlias[]) { this.register('post', path, ...handlers); }
  put(path: string, ...handlers: HandlerOrAlias[]) { this.register('put', path, ...handlers); }
  patch(path: string, ...handlers: HandlerOrAlias[]) { this.register('patch', path, ...handlers); }
  delete(path: string, ...handlers: HandlerOrAlias[]) { this.register('delete', path, ...handlers); }
  all(path: string, ...handlers: HandlerOrAlias[]) { this.register('all', path, ...handlers); }

  resource(name: string, controller: any) {
    this.get(`/${name}`, controller.index);
    this.post(`/${name}`, controller.store || controller.create);
    this.get(`/${name}/:id`, controller.show);
    this.put(`/${name}/:id`, controller.update);
    this.patch(`/${name}/:id`, controller.update);
    this.delete(`/${name}/:id`, controller.destroy || controller.delete);
  }

  build(): Router {
    return this.router;
  }
}

export default RouterBuilder;
