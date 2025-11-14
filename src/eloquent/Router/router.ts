import { Router, RequestHandler } from 'express';
import {resolveMiddleware} from "@/eloquent/Middleware/middleware";

export type HandlerOrAlias = RequestHandler | string | Array<RequestHandler | string>;
export type GroupOptions = { prefix?: string; middleware?: RequestHandler | RequestHandler[] | string | string[] };

// Fluent prefix return type for stronger typing
export type PrefixFluent = {
  middleware(mw: RequestHandler | RequestHandler[] | string | string[], cb?: (rb: RouterBuilder) => void): RouterBuilder | { group(cb: (rb: RouterBuilder) => void): RouterBuilder };
  group(cb: (rb: RouterBuilder) => void): RouterBuilder;
};

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

  // Accept either group(cb) or group(options, cb)
  group(optionsOrCb: GroupOptions | ((rb: RouterBuilder) => void), cb?: (rb: RouterBuilder) => void): void {
    let options: GroupOptions = {};
    let callback: (rb: RouterBuilder) => void;
    if (typeof optionsOrCb === 'function') {
      callback = optionsOrCb as (rb: RouterBuilder) => void;
    } else {
      options = optionsOrCb || {} as GroupOptions;
      if (!cb) throw new Error('group(options, cb) requires a callback');
      callback = cb as (rb: RouterBuilder) => void;
    }

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
      callback(this);
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

  // Fluent helpers: provide a typed fluent object for prefix chaining
  prefix(prefix: string): PrefixFluent {
    const self = this;
    return {
      middleware(mw: RequestHandler | RequestHandler[] | string | string[], cb?: (rb: RouterBuilder) => void) {
        if (cb) {
          self.group({ prefix, middleware: mw as any }, cb);
          return self;
        }
        return {
          group(cb2: (rb: RouterBuilder) => void) {
            self.group({ prefix, middleware: mw as any }, cb2);
            return self;
          }
        } as any;
      },
      group(cb: (rb: RouterBuilder) => void) {
        self.group({ prefix }, cb);
        return self;
      }
    };
  }

  // Overloads for middleware chaining
  middleware(mw: RequestHandler | RequestHandler[] | string | string[], cb: (rb: RouterBuilder) => void): RouterBuilder;
  middleware(mw: RequestHandler | RequestHandler[] | string | string[]): { group(cb: (rb: RouterBuilder) => void): RouterBuilder };
  middleware(mw: RequestHandler | RequestHandler[] | string | string[], cb?: (rb: RouterBuilder) => void) {
    if (cb) {
      this.group({ middleware: mw as any }, cb);
      return this;
    }
    const self = this;
    return {
      group(cb2: (rb: RouterBuilder) => void) {
        self.group({ middleware: mw as any }, cb2);
        return self;
      }
    } as any;
  }

  build(): Router {
    return this.router;
  }
}

export default RouterBuilder;
