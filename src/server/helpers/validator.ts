import { query, getDbType, collection } from '@/config/db.config';

export class ValidationError extends Error {
  errors: Record<string, string[]>;
  constructor(errors: Record<string, string[]>) {
    super('Validation failed');
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export type RuleFn = (value: any, payload?: any) => true | { ok: boolean; message?: string; value?: any } | false | Promise<any>;

export async function validate(payload: any, rules: Record<string, string | RuleFn>): Promise<any> {
   const out: any = { ...(payload || {}) };
   const errors: Record<string, string[]> = {};

   for (const field of Object.keys(rules)) {
     const rule = rules[field];
     const raw = payload ? payload[field] : undefined;

     if (typeof rule === 'function') {
      const res = await (rule as RuleFn)(raw, payload);
      if (res === true) continue;
      if (res === false) {
        errors[field] = errors[field] || [];
        errors[field].push('invalid');
        continue;
      }
      if (res && (res as any).ok === false) {
        errors[field] = errors[field] || [];
        errors[field].push((res as any).message || 'invalid');
        continue;
      }
      if (res && (res as any).ok === true && 'value' in (res as any)) {
        out[field] = (res as any).value;
        continue;
      }
      continue;
    }

     const parts = String(rule).split('|').map(s => s.trim()).filter(Boolean);
     const isRequired = parts.includes('required');

     const present = raw !== undefined && raw !== null && raw !== '';

     if (isRequired && !present) {
       errors[field] = errors[field] || [];
       errors[field].push('required');
       continue;
     }

     if (!present) {
       // not present and not required -> skip
       continue;
     }

     let val: any = raw;
     let failed = false;

     for (const p of parts) {
       if (p === 'required' || p === 'nullable') continue;
      if (p === 'string') {
        if (typeof val !== 'string') val = String(val);
      } else if (p === 'int' || p === 'integer') {
        const n = parseInt(val as any, 10);
        if (Number.isNaN(n)) { errors[field] = errors[field] || []; errors[field].push('integer'); failed = true; break; }
        val = n;
      } else if (p === 'numeric' || p === 'float' || p === 'double') {
        const n = Number(val as any);
        if (Number.isNaN(n)) { errors[field] = errors[field] || []; errors[field].push('numeric'); failed = true; break; }
        val = n;
      } else if (p === 'array') {
        if (!Array.isArray(val)) {
          if (typeof val === 'string') {
            try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) val = parsed; else { errors[field] = errors[field] || []; errors[field].push('array'); failed = true; break; } } catch { errors[field] = errors[field] || []; errors[field].push('array'); failed = true; break; }
          } else { errors[field] = errors[field] || []; errors[field].push('array'); failed = true; break; }
        }
      } else if (p === 'json') {
        if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch { errors[field] = errors[field] || []; errors[field].push('json'); failed = true; break; }
        }
      } else if (p.startsWith('min:')) {
        const arg = Number(p.split(':')[1]);
        if (typeof val === 'number') { if (val < arg) { errors[field] = errors[field] || []; errors[field].push(`min:${arg}`); failed = true; break; } }
        else if (typeof val === 'string' || Array.isArray(val)) { if ((val as any).length < arg) { errors[field] = errors[field] || []; errors[field].push(`min:${arg}`); failed = true; break; } }
      } else if (p.startsWith('max:')) {
        const arg = Number(p.split(':')[1]);
        if (typeof val === 'number') { if (val > arg) { errors[field] = errors[field] || []; errors[field].push(`max:${arg}`); failed = true; break; } }
        else if (typeof val === 'string' || Array.isArray(val)) { if ((val as any).length > arg) { errors[field] = errors[field] || []; errors[field].push(`max:${arg}`); failed = true; break; } }
      } else if (p.startsWith('in:')) {
         const opts = p.split(':')[1].split(',').map(s => s.trim());
         if (!opts.includes(String(val))) { errors[field] = errors[field] || []; errors[field].push('in'); failed = true; break; }
      } else if (p.startsWith('exists:')) {
        // exists:table,column  -> ensure a row exists with column = val
        try {
          const spec = p.split(':')[1];
          const [table, column] = spec.split(',');
          if (getDbType() === 'mysql') {
            const rows: any = await query(`SELECT 1 FROM \`${table}\` WHERE \`${column}\` = ? LIMIT 1`, [val]);
            if (!rows || rows.length === 0) { errors[field] = errors[field] || []; errors[field].push('exists'); failed = true; break; }
          } else {
            const col = collection(table);
            const found = await col.findOne({ [column]: val });
            if (!found) { errors[field] = errors[field] || []; errors[field].push('exists'); failed = true; break; }
          }
        } catch (e) { errors[field] = errors[field] || []; errors[field].push('exists'); failed = true; break; }
      } else if (p.startsWith('unique:')) {
        // unique:table,column[,exceptValue]
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
            if (c > 0) { errors[field] = errors[field] || []; errors[field].push('unique'); failed = true; break; }
          } else {
            const col = collection(table);
            const q: any = { [column]: val };
            if (except) q._id = { $ne: except };
            const found = await col.countDocuments(q);
            if (found > 0) { errors[field] = errors[field] || []; errors[field].push('unique'); failed = true; break; }
          }
        } catch (e) { errors[field] = errors[field] || []; errors[field].push('unique'); failed = true; break; }
       } else {
         // unknown rule - ignore
       }
     }

     if (!failed) out[field] = val;
   }

   if (Object.keys(errors).length) throw new ValidationError(errors);
   return out;
 }

// Helper rule to normalize images input to array/object
export const imagesRule: RuleFn = async (value: any) => {
  if (value === undefined || value === null || value === '') return true;
  try {
    if (Array.isArray(value)) return { ok: true, value };
    if (typeof value === 'string') {
      // try JSON
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) || typeof parsed === 'object') return { ok: true, value: parsed };
      } catch {}
      // comma-separated
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
