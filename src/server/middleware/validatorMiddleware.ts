import { Request, Response, NextFunction } from 'express';
import {RuleFn, validate} from '@/server/helpers/validator';

declare global {
    namespace Express { interface Request { validate: (payload?: any, rules?: Record<string, string | RuleFn>) => Promise<any>  } }
}

export default function validatorMiddleware(req: Request & { validate?: any }, res: Response, next: NextFunction) {
  // attach an async validate method: req.validate(payloadOrRules?, rules?)
  req.validate = async function(payloadOrRules: any, maybeRules?: any) {
    // If called as req.validate(rules) where payload is undefined, default to req.body.payload or req.body
    let payload = undefined as any;
    let rules = undefined as any;
    if (maybeRules === undefined && typeof payloadOrRules === 'object' && !Array.isArray(payloadOrRules) && Object.keys(payloadOrRules || {}).length && Object.values(payloadOrRules).every(v => typeof v === 'string' || typeof v === 'function')) {
      // Looks like rules object
      rules = payloadOrRules;
      payload = (req as any).body && (req as any).body.payload ? (req as any).body.payload : (req as any).body;
    } else if (maybeRules === undefined && typeof payloadOrRules === 'string') {
      // single string rule for a field? Not supported here – caller should pass rules object
      throw new Error('Invalid validate invocation. Use req.validate(payload, rules) or req.validate(rules)');
    } else if (maybeRules !== undefined) {
      payload = payloadOrRules;
      rules = maybeRules;
    } else {
      // payloadOrRules may be payload
      payload = payloadOrRules || ((req as any).body && (req as any).body.payload ? (req as any).body.payload : (req as any).body);
      rules = maybeRules;
    }

    if (!rules) throw new Error('No validation rules provided');
    return await validate(payload, rules);
  };

  next();
}

