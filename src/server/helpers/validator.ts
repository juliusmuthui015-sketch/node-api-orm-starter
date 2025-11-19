import { query, getDbType, collection } from '@/config/db.config';

export class ValidationError extends Error {
  errors: Record<string, string[]>; // legacy codes
  messages: Record<string, string[]>; // resolved human messages
  constructor(errors: Record<string, string[]>, messages?: Record<string, string[]>) {
    super('Validation failed');
    this.errors = errors;
    this.messages = messages || {};
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export type RuleFn = (value: any, payload?: any) => true | { ok: boolean; message?: string; value?: any } | false | Promise<any>;
export type RuleSpec = string | RuleFn | { rule: string | RuleFn; messages?: Record<string, string> };

// Default message catalog similar to Laravel (lightweight)
const defaultMessages: Record<string, string> = {
  required: ':attribute field is required.',
  integer: ':attribute must be an integer.',
  numeric: ':attribute must be a number.',
  array: ':attribute must be an array.',
  json: ':attribute must be valid JSON.',
  email: ':attribute must be a valid email address.',
  'min.numeric': ':attribute must be at least :min.',
  'min.string': ':attribute must be at least :min characters.',
  'min.array': ':attribute must have at least :min items.',
  'max.numeric': ':attribute may not be greater than :max.',
  'max.string': ':attribute may not be greater than :max characters.',
  'max.array': ':attribute may not have more than :max items.',
  in: ':attribute must be one of: :values.',
  exists: 'Selected :attribute is invalid.',
  unique: ':attribute has already been taken.',
  invalid: ':attribute is invalid.',
  confirmed: ':attribute confirmation does not match.',
  boolean: ':attribute must be a boolean.',
  url: ':attribute must be a valid URL.',
  alpha: ':attribute may only contain letters.',
  alpha_num: ':attribute may only contain letters and numbers.',
  date: ':attribute is not a valid date.',
  same: ':attribute must match :other.',
  different: ':attribute must be different from :other.',
  regex: ':attribute format is invalid.'
};

function formatMessage(template: string, ctx: Record<string, any>): string {
  return template.replace(/:([a-zA-Z_]+)/g, (_, key) => ctx[key] !== undefined ? String(ctx[key]) : ':' + key);
}

function resolveMessage(field: string, code: string, meta: Record<string, any>, custom?: Record<string, string>): string {
  let variantCode = code;
  if ((code === 'min' || code === 'max') && meta.kind) variantCode = `${code}.${meta.kind}`;
  const attrLabel = custom && custom[`attributes.${field}`] ? custom[`attributes.${field}`] : field;
  const candidates = [
    `${field}.${variantCode}`,
    `${field}.${code}`,
    variantCode,
    code
  ];
  for (const c of candidates) {
    if (custom && custom[c]) return formatMessage(custom[c], { ...meta, attribute: attrLabel });
    if (defaultMessages[c]) return formatMessage(defaultMessages[c], { ...meta, attribute: attrLabel });
  }
  return code;
}

export async function validate(payload: any, rules: Record<string, RuleSpec>, customMessages?: Record<string, string>): Promise<any> {
   const out: any = { ...(payload || {}) };
   const errors: Record<string, string[]> = {};
   const messageErrors: Record<string, string[]> = {};
   const metaErrors: Record<string, { code: string; meta: Record<string, any> }[]> = {};
   const fieldMessagesMap: Record<string, Record<string, string>> = {};

   for (const field of Object.keys(rules)) {
     const spec = rules[field];
     let fieldRule: string | RuleFn;
     if (typeof spec === 'object' && spec && !(spec instanceof Function) && 'rule' in spec) {
       fieldRule = spec.rule as any;
       if (spec.messages) {
         const prefixed: Record<string, string> = {};
         for (const [k, v] of Object.entries(spec.messages)) {
           if (k.startsWith(field + '.')) prefixed[k] = v; else prefixed[`${field}.${k}`] = v;
         }
         fieldMessagesMap[field] = prefixed;
       }
     } else {
       fieldRule = spec as any;
     }

     const raw = payload ? payload[field] : undefined;

     if (typeof fieldRule === 'function') {
      const res = await (fieldRule as RuleFn)(raw, payload);
      if (res === true) continue;
      if (res === false) {
        errors[field] = errors[field] || []; errors[field].push('invalid');
        metaErrors[field] = metaErrors[field] || []; metaErrors[field].push({ code: 'invalid', meta: { value: raw, kind: typeof raw } });
        continue;
      }
      if (res && (res as any).ok === false) {
        const msgCode = (res as any).message || 'invalid';
        errors[field] = errors[field] || []; errors[field].push(msgCode);
        metaErrors[field] = metaErrors[field] || []; metaErrors[field].push({ code: msgCode, meta: { value: raw, kind: typeof raw } });
        continue;
      }
      if (res && (res as any).ok === true && 'value' in (res as any)) {
        out[field] = (res as any).value;
        continue;
      }
      continue;
    }

     const parts = String(fieldRule).split('|').map(s => s.trim()).filter(Boolean);
     let isRequired = parts.includes('required');
     let conditionalRequired = false;
     for (const pr of parts) {
       if (pr.startsWith('required_if:')) {
         const spec = pr.split(':')[1];
         const [other, expected] = spec.split(',');
         if (payload && String(payload[other]) === expected) conditionalRequired = true;
       } else if (pr.startsWith('required_unless:')) {
         const spec = pr.split(':')[1];
         const [other, value] = spec.split(',');
         if (payload && String(payload[other]) !== value) conditionalRequired = true;
       }
     }
     const mustBePresent = isRequired || conditionalRequired;

     const present = raw !== undefined && raw !== null && raw !== '';

     if (mustBePresent && !present) {
       errors[field] = errors[field] || []; errors[field].push('required');
       metaErrors[field] = metaErrors[field] || []; metaErrors[field].push({ code: 'required', meta: { value: raw } });
       continue;
     }

     if (!present) {
       continue;
     }

     let val: any = raw;
     let failed = false;

     const pushErr = (code: string, meta: Record<string, any> = {}) => {
       errors[field] = errors[field] || []; errors[field].push(code);
       metaErrors[field] = metaErrors[field] || []; metaErrors[field].push({ code, meta });
       failed = true;
     };

     for (const p of parts) {
       if (p === 'required' || p === 'nullable' || p.startsWith('required_if:') || p.startsWith('required_unless:')) continue;
       if (p === 'string') {
         if (typeof val !== 'string') val = String(val);
       } else if (p === 'email') {
         if (typeof val !== 'string') val = String(val);
         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
         if (!emailRegex.test(val)) { pushErr('email', { value: val, kind: 'string' }); break; }
       } else if (p === 'int' || p === 'integer') {
         const n = parseInt(val as any, 10);
         if (Number.isNaN(n)) { pushErr('integer', { value: val, kind: typeof val }); break; }
         val = n;
       } else if (p === 'numeric' || p === 'float' || p === 'double') {
         const n = Number(val as any);
         if (Number.isNaN(n)) { pushErr('numeric', { value: val, kind: typeof val }); break; }
         val = n;
       } else if (p === 'array') {
         if (!Array.isArray(val)) {
          if (typeof val === 'string') {
            try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) val = parsed; else { pushErr('array', { value: val, kind: typeof val }); break; } } catch { pushErr('array', { value: val, kind: typeof val }); break; }
          } else { pushErr('array', { value: val, kind: typeof val }); break; }
         }
       } else if (p === 'json') {
         if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch { pushErr('json', { value: val, kind: typeof val }); break; }
         }
       } else if (p === 'boolean') {
         if (typeof val === 'string') {
           const v = val.toLowerCase();
           if (['true','1','yes','on'].includes(v)) val = true; else if (['false','0','no','off'].includes(v)) val = false; else { pushErr('boolean', { value: val }); break; }
         } else if (typeof val === 'number') {
           if (val === 1) val = true; else if (val === 0) val = false; else { pushErr('boolean', { value: val }); break; }
         } else if (typeof val !== 'boolean') { pushErr('boolean', { value: val }); break; }
       } else if (p === 'alpha') {
         if (typeof val !== 'string') val = String(val);
         if (!/^[A-Za-z]+$/.test(val)) { pushErr('alpha', { value: val }); break; }
       } else if (p === 'alpha_num') {
         if (typeof val !== 'string') val = String(val);
         if (!/^[A-Za-z0-9]+$/.test(val)) { pushErr('alpha_num', { value: val }); break; }
       } else if (p === 'url') {
         if (typeof val !== 'string') val = String(val);
         const urlRegex = /^(https?:\/\/)[\w.-]+(?:\.[\w\.-]+)+(?:[\w\-\._~:/?#[\]@!$&'()*+,;=.]+)?$/i;
         if (!urlRegex.test(val)) { pushErr('url', { value: val }); break; }
       } else if (p === 'date') {
         if (typeof val === 'string' || val instanceof Date) {
           const d = new Date(val);
           if (isNaN(d.getTime())) { pushErr('date', { value: val }); break; }
           val = d;
         } else { pushErr('date', { value: val }); break; }
       } else if (p.startsWith('same:')) {
         const other = p.split(':')[1];
         const otherVal = payload ? payload[other] : undefined;
         if (String(val) !== String(otherVal)) { pushErr('same', { value: val, other, otherValue: otherVal }); break; }
       } else if (p.startsWith('different:')) {
         const other = p.split(':')[1];
         const otherVal = payload ? payload[other] : undefined;
         if (String(val) === String(otherVal)) { pushErr('different', { value: val, other, otherValue: otherVal }); break; }
       } else if (p.startsWith('regex:')) {
         const pattern = p.substring('regex:'.length);
         // Expect pattern like /.../flags or raw body; attempt parse
         let re: RegExp | null = null;
         if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
           const lastSlash = pattern.lastIndexOf('/');
           const body = pattern.slice(1, lastSlash);
           const flags = pattern.slice(lastSlash + 1);
           try { re = new RegExp(body, flags); } catch {}
         } else {
           try { re = new RegExp(pattern); } catch {}
         }
         if (!re) { pushErr('regex', { value: val }); break; }
         if (typeof val !== 'string') val = String(val);
         if (!re.test(val)) { pushErr('regex', { value: val }); break; }
       } else if (p.startsWith('min:')) {
         const arg = Number(p.split(':')[1]);
         if (typeof val === 'number') { if (val < arg) { pushErr('min', { min: arg, value: val, kind: 'numeric' }); break; } }
         else if (typeof val === 'string') { if (val.length < arg) { pushErr('min', { min: arg, value: val, kind: 'string' }); break; } }
         else if (Array.isArray(val)) { if (val.length < arg) { pushErr('min', { min: arg, value: val, kind: 'array' }); break; } }
       } else if (p.startsWith('max:')) {
         const arg = Number(p.split(':')[1]);
         if (typeof val === 'number') { if (val > arg) { pushErr('max', { max: arg, value: val, kind: 'numeric' }); break; } }
         else if (typeof val === 'string') { if (val.length > arg) { pushErr('max', { max: arg, value: val, kind: 'string' }); break; } }
         else if (Array.isArray(val)) { if (val.length > arg) { pushErr('max', { max: arg, value: val, kind: 'array' }); break; } }
       } else if (p.startsWith('in:')) {
         const opts = p.split(':')[1].split(',').map(s => s.trim());
         if (!opts.includes(String(val))) { pushErr('in', { value: val, values: opts.join(', ') }); break; }
       } else if (p.startsWith('exists:')) {
         try {
           const spec = p.split(':')[1];
           const [table, column] = spec.split(',');
           if (getDbType() === 'mysql') {
             const rows: any = await query(`SELECT 1 FROM \`${table}\` WHERE \`${column}\` = ? LIMIT 1`, [val]);
             if (!rows || rows.length === 0) { pushErr('exists', { value: val, table, column }); break; }
           } else {
             const col = collection(table);
             const found = await col.findOne({ [column]: val });
             if (!found) { pushErr('exists', { value: val, table, column }); break; }
           }
         } catch (e) { pushErr('exists', { value: val }); break; }
       } else if (p.startsWith('unique:')) {
         try {
           const spec = p.split(':')[1];
           const partsSpec = spec.split(',').map(s => s.trim());
           const table = partsSpec[0];
           const column = partsSpec[1] || 'id';
           const except = partsSpec[2];
           if (getDbType() === 'mysql') {
             let sql = `SELECT COUNT(*) as c FROM \`${table}\` WHERE \`${column}\` = ?`;
             const params: any[] = [val];
             if (except !== undefined && except !== '') {
               sql += ` AND id != ?`;
               params.push(except);
             }
             const rows: any = await query(sql, params);
             const c = rows && rows[0] && (rows[0] as any).c !== undefined ? Number((rows[0] as any).c) : (rows[0] && Object.values(rows[0])[0]) || 0;
             if (c > 0) { pushErr('unique', { value: val, table, column }); break; }
           } else {
             const col = collection(table);
             const q: any = { [column]: val };
             if (except) q._id = { $ne: except };
             const found = await col.countDocuments(q);
             if (found > 0) { pushErr('unique', { value: val, table, column }); break; }
           }
         } catch (e) { pushErr('unique', { value: val }); break; }
       } else if (p === 'confirmed') {
         const confirmationField = field + '_confirmation';
         const confirmationValue = payload ? payload[confirmationField]??payload['confirmation'] : undefined;
         if (confirmationValue === undefined) { pushErr('confirmed', { value: val, confirmation: confirmationValue }); break; }
         if (String(val) !== String(confirmationValue)) { pushErr('confirmed', { value: val, confirmation: confirmationValue }); break; }
       } else {
         // unknown rule - ignore
       }
     }

     if (!failed) out[field] = val;
   }

   for (const field of Object.keys(metaErrors)) {
     for (const item of metaErrors[field]) {
       const merged = { ...(customMessages || {}), ...(fieldMessagesMap[field] || {}) };
       const msg = resolveMessage(field, item.code, item.meta, merged);
       messageErrors[field] = messageErrors[field] || []; messageErrors[field].push(msg);
     }
   }

   if (Object.keys(errors).length) throw new ValidationError(errors, messageErrors);
   return out;
 }

// Helper rule to normalize images input to array/object
export const imagesRule: RuleFn = async (value: any) => {
  if (value === undefined || value === null || value === '') return true;
  try {
    if (Array.isArray(value)) return { ok: true, value };
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) || typeof parsed === 'object') return { ok: true, value: parsed };
      } catch {}
      if (value.includes(',')) return { ok: true, value: value.split(',').map((s: string) => s.trim()).filter(Boolean) };
      return { ok: true, value: [value] };
    }
    if (typeof value === 'object') return { ok: true, value };
    return { ok: true, value: [String(value)] };
  } catch (e) {
    return { ok: false, message: 'invalid_images' };
  }
};

// Helper rule to normalize amenities input to array/object
export const amenitiesRule: RuleFn = async (value: any) => {
  if (value === undefined || value === null || value === '') return true;
  try {
    if (Array.isArray(value) || typeof value === 'object') return { ok: true, value };
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) || typeof parsed === 'object') return { ok: true, value: parsed };
      } catch {}
      if (value.includes(',')) return { ok: true, value: value.split(',').map((s: string) => s.trim()).filter(Boolean) };
      return { ok: true, value: [value] };
    }
    return { ok: true, value: [String(value)] };
  } catch (e) {
    return { ok: false, message: 'invalid_amenities' };
  }
};
