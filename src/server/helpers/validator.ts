import { query, getDbType, collection } from '@/config/db.config';
import { ObjectId } from 'mongodb';
import {EloquentBuilder} from "@/eloquent/EloquentBuilder";
import {Model} from "@/eloquent/Model";

export class ValidationError extends Error {
  errors: Record<string, string[]>;
  messages: Record<string, string[]>;

  constructor(errors: Record<string, string[]>, messages?: Record<string, string[]>) {
    super('Validation failed');
    this.errors = errors;
    this.messages = messages || {};
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export type RuleFn = (
  value: any,
  field: string,
  payload?: any,
) => true | { ok: boolean; message?: string; value?: any } | false | Promise<any>;

export type RuleSpec =
  | string
  | RuleFn
  | { rule: string | RuleFn; messages?: Record<string, string> };

// Extended default message catalog
const defaultMessages: Record<string, string> = {
  // Basic types
  required: ':attribute field is required.',
  integer: ':attribute must be an integer.',
  numeric: ':attribute must be a number.',
  array: ':attribute must be an array.',
  json: ':attribute must be valid JSON.',
  email: ':attribute must be a valid email address.',
  boolean: ':attribute must be true or false.',
  date: ':attribute must be a valid date.',
  url: ':attribute must be a valid URL.',
  uuid: ':attribute must be a valid UUID.',
  object: ':attribute must be an object.',

  // Size constraints
  'min.numeric': ':attribute must be at least :min.',
  'min.string': ':attribute must be at least :min characters.',
  'min.array': ':attribute must have at least :min items.',
  'max.numeric': ':attribute may not be greater than :max.',
  'max.string': ':attribute may not be greater than :max characters.',
  'max.array': ':attribute may not have more than :max items.',
  'size.string': ':attribute must be exactly :size characters.',
  'size.array': ':attribute must contain exactly :size items.',
  'size.numeric': ':attribute must be exactly :size.',

  // Range constraints
  'between.numeric': ':attribute must be between :min and :max.',
  'between.string': ':attribute must be between :min and :max characters.',
  'between.array': ':attribute must have between :min and :max items.',

  // Format validations
  regex: ':attribute format is invalid.',
  regex_invalid: 'Invalid regex pattern for :attribute validation.',
  phone: ':attribute must be a valid phone number.',
  credit_card: ':attribute must be a valid credit card number.',

  // Set operations
  in: ':attribute must be one of: :values.',
  not_in: ':attribute must not be one of: :values.',
  exists: 'Selected :attribute is invalid.',
  unique: ':attribute has already been taken.',

  // String operations
  starts_with: ':attribute must start with one of: :prefixes.',
  ends_with: ':attribute must end with one of: :suffixes.',
  contains: ':attribute must contain :substring.',

  // Boolean operations
  accepted: ':attribute must be accepted.',
  declined: ':attribute must be declined.',

  // Comparison operations
  confirmed: ':attribute confirmation does not match.',
  different: ':attribute and :other must be different.',
  same: ':attribute and :other must be the same.',
  gt: ':attribute must be greater than :field.',
  gte: ':attribute must be greater than or equal to :field.',
  lt: ':attribute must be less than :field.',
  lte: ':attribute must be less than or equal to :field.',

  // File validations
  file: ':attribute must be a file.',
  mimes: ':attribute must be a file of type: :values.',
  max_file_size: ':attribute may not be larger than :max MB.',

  // Custom
  invalid: ':attribute is invalid.',
  nested_validation_failed: ':attribute contains invalid data.',
  object_array: ':attribute must be an array of objects.',
};

// Helper functions
function formatMessage(template: string, ctx: Record<string, any>): string {
  return template.replace(/:([a-zA-Z_]+)/g, (_, key) =>
    ctx[key] !== undefined ? String(ctx[key]) : ':' + key,
  );
}

function resolveMessage(
  field: string,
  code: string,
  meta: Record<string, any>,
  custom?: Record<string, string>,
): string {
  let variantCode = code;
  if (['min', 'max', 'size', 'between'].includes(code) && meta.kind) {
    variantCode = `${code}.${meta.kind}`;
  }

  const attrLabel = custom && custom[`attributes.${field}`] ? custom[`attributes.${field}`] : field;
  const candidates = [`${field}.${variantCode}`, `${field}.${code}`, variantCode, code];

  for (const c of candidates) {
    if (custom && custom[c]) return formatMessage(custom[c], { ...meta, attribute: attrLabel });
    if (defaultMessages[c])
      return formatMessage(defaultMessages[c], { ...meta, attribute: attrLabel });
  }

  return formatMessage(defaultMessages.invalid || 'Invalid value', {
    ...meta,
    attribute: attrLabel,
  });
}

// Core validation function
export async function validate<T extends Record<string, any>>(
  payload: any,
  rules: Record<string, RuleSpec>,
  customMessages?: Record<string, string>,
): Promise<T> {
    const out = { ...(payload || {}) } as unknown as T & Record<string, any>;
    const errors: Record<string, string[]> = {};
  const messageErrors: Record<string, string[]> = {};
  const metaErrors: Record<string, { code: string; meta: Record<string, any> }[]> = {};
  const fieldMessagesMap: Record<string, Record<string, string>> = {};

  for (const field of Object.keys(rules)) {
    const spec = rules[field];
    let fieldRule: string | RuleFn;

    // Parse rule specification
    if (typeof spec === 'object' && spec && !(spec instanceof Function) && 'rule' in spec) {
      fieldRule = spec.rule as any;
      if (spec.messages) {
        const prefixed: Record<string, string> = {};
        for (const [k, v] of Object.entries(spec.messages)) {
          prefixed[k.startsWith(field + '.') ? k : `${field}.${k}`] = v;
        }
        fieldMessagesMap[field] = prefixed;
      }
    } else {
      fieldRule = spec as any;
    }

    const raw = payload ? payload[field] : undefined;

    // Handle function rules
    if (typeof fieldRule === 'function') {
      const res = await (fieldRule as RuleFn)(raw, field, payload);
      if (res === true) continue;
      if (res === false) {
        pushError(field, 'invalid', { value: raw, kind: typeof raw });
        continue;
      }
      if (res && (res as any).ok === false) {
        const msgCode = (res as any).message || 'invalid';
        pushError(field, msgCode, { value: raw, kind: typeof raw });
        continue;
      }
      if (res && (res as any).ok === true && 'value' in (res as any)) {
          (out as any)[field] = (res as any).value;
        continue;
      }
      continue;
    }

    // Handle string rules
    const parts = String(fieldRule)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);

    const isRequired = parts.includes('required');
    const isNullable = parts.includes('nullable');
    const present = raw !== undefined && raw !== null && raw !== '';

    // Check required field
    if (isRequired && !present) {
      pushError(field, 'required', { value: raw });
      continue;
    }

    // Skip validation for nullable empty fields
    if (!present && (isNullable || !isRequired)) {
      continue;
    }

    let val: any = raw;
    let failed = false;

    // Process each rule part
    for (const p of parts) {
      if (p === 'required' || p === 'nullable') continue;

      if (failed) break;

      // Type conversion and validation rules
      switch (true) {
        case p === 'string':
          if (typeof val !== 'string') val = String(val);
          break;

        case p === 'email':
          if (typeof val !== 'string') val = String(val);
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(val)) {
            pushError(field, 'email', { value: val, kind: 'string' });
            failed = true;
          }
          break;

        case p === 'int' || p === 'integer':
          const intVal = parseInt(val, 10);
          if (Number.isNaN(intVal)) {
            pushError(field, 'integer', { value: val, kind: typeof val });
            failed = true;
          } else {
            val = intVal;
          }
          break;

        case p === 'numeric' || p === 'float' || p === 'double':
          const numVal = Number(val);
          if (Number.isNaN(numVal)) {
            pushError(field, 'numeric', { value: val, kind: typeof val });
            failed = true;
          } else {
            val = numVal;
          }
          break;

        case p === 'boolean':
          if (typeof val === 'string') {
            const lowerVal = val.toLowerCase();
            if (['true', '1', 'yes', 'on'].includes(lowerVal)) {
              val = true;
            } else if (['false', '0', 'no', 'off'].includes(lowerVal)) {
              val = false;
            } else {
              pushError(field, 'boolean', { value: val, kind: typeof val });
              failed = true;
            }
          } else if (typeof val !== 'boolean') {
            pushError(field, 'boolean', { value: val, kind: typeof val });
            failed = true;
          }
          break;

        case p === 'array':
          if (!Array.isArray(val)) {
            if (typeof val === 'string') {
              try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) val = parsed;
                else {
                  pushError(field, 'array', { value: val, kind: typeof val });
                  failed = true;
                }
              } catch {
                pushError(field, 'array', { value: val, kind: typeof val });
                failed = true;
              }
            } else {
              pushError(field, 'array', { value: val, kind: typeof val });
              failed = true;
            }
          }
          break;

        case p === 'json':
          if (typeof val === 'string') {
            try {
              val = JSON.parse(val);
            } catch {
              pushError(field, 'json', { value: val, kind: typeof val });
              failed = true;
            }
          }
          break;

        case p === 'date':
          const date = new Date(val);
          if (isNaN(date.getTime())) {
            pushError(field, 'date', { value: val, kind: typeof val });
            failed = true;
          } else {
            val = date;
          }
          break;

        case p === 'url':
          try {
            new URL(val);
          } catch {
            pushError(field, 'url', { value: val, kind: typeof val });
            failed = true;
          }
          break;

        case p === 'uuid':
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(String(val))) {
            pushError(field, 'uuid', { value: val, kind: typeof val });
            failed = true;
          }
          break;

        case p === 'phone':
          const phoneRegex = /^\+?[1-9]\d{1,14}$/;
          if (!phoneRegex.test(String(val))) {
            pushError(field, 'phone', { value: val, kind: typeof val });
            failed = true;
          }
          break;

        case p.startsWith('min:'):
          await handleMinRule(field, val, p);
          break;

        case p.startsWith('max:'):
          await handleMaxRule(field, val, p);
          break;

        case p.startsWith('size:'):
          await handleSizeRule(field, val, p);
          break;

        case p.startsWith('between:'):
          await handleBetweenRule(field, val, p);
          break;

        case p.startsWith('in:'):
          await handleInRule(field, val, p);
          break;

        case p.startsWith('not_in:'):
          await handleNotInRule(field, val, p);
          break;

        case p.startsWith('exists:'):
          await handleExistsRule(field, val, p);
          break;

        case p.startsWith('unique:'):
          await handleUniqueRule(field, val, p);
          break;

        case p.startsWith('regex:'):
          await handleRegexRule(field, val, p);
          break;

        case p.startsWith('starts_with:'):
          await handleStartsWithRule(field, val, p);
          break;

        case p.startsWith('ends_with:'):
          await handleEndsWithRule(field, val, p);
          break;

        case p.startsWith('contains:'):
          await handleContainsRule(field, val, p);
          break;

        case p.startsWith('gt:'):
          await handleComparisonRule(field, val, p, 'gt', payload);
          break;

        case p.startsWith('gte:'):
          await handleComparisonRule(field, val, p, 'gte', payload);
          break;

        case p.startsWith('lt:'):
          await handleComparisonRule(field, val, p, 'lt', payload);
          break;

        case p.startsWith('lte:'):
          await handleComparisonRule(field, val, p, 'lte', payload);
          break;

        case p === 'accepted':
          const accepted = [true, 1, '1', 'yes', 'on'];
          if (!accepted.includes(val)) {
            pushError(field, 'accepted', { value: val });
            failed = true;
          }
          break;

        case p === 'declined':
          const declined = [false, 0, '0', 'no', 'off'];
          if (!declined.includes(val)) {
            pushError(field, 'declined', { value: val });
            failed = true;
          }
          break;

        case p === 'confirmed':
          const confirmationField = `${field}_confirmation`;
          if (
            payload &&
            (payload[confirmationField] ||
              payload['confirmation_' + field] ||
              payload[field + '_confirmed'] ||
              payload['confirmed_' + field] ||
              payload['confirm_' + field] ||
              payload['confirm_' + field]) !== val
          ) {
            pushError(field, 'confirmed', { other: confirmationField });
            failed = true;
          }
          break;

        case p.startsWith('different:'):
          const diffField = p.split(':')[1];
          if (payload && payload[diffField] === val) {
            pushError(field, 'different', { other: diffField });
            failed = true;
          }
          break;

        case p.startsWith('same:'):
          const sameField = p.split(':')[1];
          if (payload && payload[sameField] !== val) {
            pushError(field, 'same', { other: sameField });
            failed = true;
          }
          break;

        default:
          // Unknown rule - ignore
          break;
      }
    }

    if (!failed) (out as any)[field] = val;
  }

  // Helper function to push errors
  function pushError(field: string, code: string, meta: Record<string, any> = {}) {
    errors[field] = errors[field] || [];
    errors[field].push(code);
    metaErrors[field] = metaErrors[field] || [];
    metaErrors[field].push({ code, meta });
  }

  // Generate human-readable messages
  for (const field of Object.keys(metaErrors)) {
    for (const item of metaErrors[field]) {
      const merged = { ...(customMessages || {}), ...(fieldMessagesMap[field] || {}) };
      const msg = resolveMessage(field, item.code, item.meta, merged);
      messageErrors[field] = messageErrors[field] || [];
      messageErrors[field].push(msg);
    }
  }

  if (Object.keys(errors).length) {
    throw new ValidationError(errors, messageErrors);
  }

  return out as T;

  // Rule handler functions
  async function handleMinRule(field: string, val: any, rule: string) {
    const arg = Number(rule.split(':')[1]);
    if (typeof val === 'number') {
      if (val < arg) {
        pushError(field, 'min', { min: arg, value: val, kind: 'numeric' });
        return true;
      }
    } else if (typeof val === 'string') {
      if (val.length < arg) {
        pushError(field, 'min', { min: arg, value: val, kind: 'string' });
        return true;
      }
    } else if (Array.isArray(val)) {
      if (val.length < arg) {
        pushError(field, 'min', { min: arg, value: val, kind: 'array' });
        return true;
      }
    }
    return false;
  }

  async function handleMaxRule(field: string, val: any, rule: string) {
    const arg = Number(rule.split(':')[1]);
    if (typeof val === 'number') {
      if (val > arg) {
        pushError(field, 'max', { max: arg, value: val, kind: 'numeric' });
        return true;
      }
    } else if (typeof val === 'string') {
      if (val.length > arg) {
        pushError(field, 'max', { max: arg, value: val, kind: 'string' });
        return true;
      }
    } else if (Array.isArray(val)) {
      if (val.length > arg) {
        pushError(field, 'max', { max: arg, value: val, kind: 'array' });
        return true;
      }
    }
    return false;
  }

  async function handleSizeRule(field: string, val: any, rule: string) {
    const arg = Number(rule.split(':')[1]);
    if (typeof val === 'number') {
      if (val !== arg) {
        pushError(field, 'size', { size: arg, value: val, kind: 'numeric' });
        return true;
      }
    } else if (typeof val === 'string') {
      if (val.length !== arg) {
        pushError(field, 'size', { size: arg, value: val, kind: 'string' });
        return true;
      }
    } else if (Array.isArray(val)) {
      if (val.length !== arg) {
        pushError(field, 'size', { size: arg, value: val, kind: 'array' });
        return true;
      }
    }
    return false;
  }

  async function handleBetweenRule(field: string, val: any, rule: string) {
    const args = rule.split(':')[1].split(',').map(Number);
    const [min, max] = args;
    if (typeof val === 'number') {
      if (val < min || val > max) {
        pushError(field, 'between', { min, max, value: val, kind: 'numeric' });
        return true;
      }
    } else if (typeof val === 'string') {
      if (val.length < min || val.length > max) {
        pushError(field, 'between', { min, max, value: val, kind: 'string' });
        return true;
      }
    } else if (Array.isArray(val)) {
      if (val.length < min || val.length > max) {
        pushError(field, 'between', { min, max, value: val, kind: 'array' });
        return true;
      }
    }
    return false;
  }

  async function handleInRule(field: string, val: any, rule: string) {
    const opts = rule
      .split(':')[1]
      .split(',')
      .map((s) => s.trim());
    if (!opts.includes(String(val))) {
      pushError(field, 'in', { value: val, values: opts.join(', ') });
      return true;
    }
    return false;
  }

  async function handleNotInRule(field: string, val: any, rule: string) {
    const opts = rule
      .split(':')[1]
      .split(',')
      .map((s) => s.trim());
    if (opts.includes(String(val))) {
      pushError(field, 'not_in', { value: val, values: opts.join(', ') });
      return true;
    }
    return false;
  }

  async function handleExistsRule(field: string, val: any, rule: string) {
    try {
      const spec = rule.split(':')[1];
      let [table, column] = spec.split(',');
      table = (table || '').trim();
      column = (column || 'id').trim();

        class ValidatorModel extends Model {
            static table = table;
            static primaryKey = 'id';
            static fillable = [column];
        }
        const exists = await ValidatorModel.query()
            .where(column, '=', val)
            .exists();
      if (!exists) {
          pushError(field, 'exists', { value: val, table, column });
          return true;
      }
    } catch (e) {
      pushError(field, 'exists', { value: val });
      return true;
    }
    return false;
  }

  async function handleUniqueRule(field: string, val: any, rule: string) {
    try {
      const spec = rule.split(':')[1];
      const partsSpec = spec.split(',').map((s) => s.trim());
      const table = partsSpec[0];
      let column = partsSpec[1] || 'id';
      const except = partsSpec[2];

      class ValidatorModel extends Model {
          static table = table;
          static primaryKey = 'id';
          static fillable = [column];
      }
      const exists = await ValidatorModel.query()
          .where(column, '=', val)
          .where(function (query) {
              query.where(ValidatorModel.primaryKey, '!=', except)
      }).exists();
      if (exists) {
          pushError(field, 'unique', { value: val, table, column });
          return true;
      }
    } catch (e) {
      pushError(field, 'unique', { value: val });
      return true;
    }
    return false;
  }

  async function handleRegexRule(field: string, val: any, rule: string) {
    const pattern = rule.split(':')[1];
    try {
      const regex = new RegExp(pattern);
      if (!regex.test(String(val))) {
        pushError(field, 'regex', { value: val, pattern });
        return true;
      }
    } catch {
      pushError(field, 'regex_invalid', { value: val, pattern });
      return true;
    }
    return false;
  }

  async function handleStartsWithRule(field: string, val: any, rule: string) {
    const prefixes = rule
      .split(':')[1]
      .split(',')
      .map((s) => s.trim());
    const strVal = String(val);
    if (!prefixes.some((prefix) => strVal.startsWith(prefix))) {
      pushError(field, 'starts_with', { value: val, prefixes: prefixes.join(', ') });
      return true;
    }
    return false;
  }

  async function handleEndsWithRule(field: string, val: any, rule: string) {
    const suffixes = rule
      .split(':')[1]
      .split(',')
      .map((s) => s.trim());
    const strVal = String(val);
    if (!suffixes.some((suffix) => strVal.endsWith(suffix))) {
      pushError(field, 'ends_with', { value: val, suffixes: suffixes.join(', ') });
      return true;
    }
    return false;
  }

  async function handleContainsRule(field: string, val: any, rule: string) {
    const substring = rule.split(':')[1];
    const strVal = String(val);
    if (!strVal.includes(substring)) {
      pushError(field, 'contains', { value: val, substring });
      return true;
    }
    return false;
  }

  async function handleComparisonRule(
    field: string,
    val: any,
    rule: string,
    operator: string,
    payload: any,
  ) {
    const otherField = rule.split(':')[1];
    const otherValue = payload ? payload[otherField] : undefined;

    if (otherValue === undefined) return false;

    const numVal = Number(val);
    const numOther = Number(otherValue);

    if (isNaN(numVal) || isNaN(numOther)) return false;

    let isValid = false;
    switch (operator) {
      case 'gt':
        isValid = numVal > numOther;
        break;
      case 'gte':
        isValid = numVal >= numOther;
        break;
      case 'lt':
        isValid = numVal < numOther;
        break;
      case 'lte':
        isValid = numVal <= numOther;
        break;
    }

    if (!isValid) {
      pushError(field, operator, { field: otherField, value: val, other: otherValue });
      return true;
    }
    return false;
  }
}

// Custom rule functions
export const requiredIf =
  (otherField: string, value: any): RuleFn =>
  async (val, field, payload) => {
    if (payload && payload[otherField] === value) {
      if (val === undefined || val === null || val === '') {
        return { ok: false, message: 'required' };
      }
    }
    return true;
  };

export const requiredUnless =
  (otherField: string, value: any): RuleFn =>
  async (val, field, payload) => {
    if (payload && payload[otherField] !== value) {
      if (val === undefined || val === null || val === '') {
        return { ok: false, message: 'required' };
      }
    }
    return true;
  };

// File validation rules
export const fileRule: RuleFn = async (value) => {
  if (!value) return true;

  if (
    typeof value === 'object' &&
    (value instanceof File || ('name' in value && 'size' in value))
  ) {
    return true;
  }

  return { ok: false, message: 'file' };
};

export const mimes =
  (allowedTypes: string[]): RuleFn =>
  async (value) => {
    if (!value) return true;

    let fileName = '';
    if (typeof value === 'string') {
      fileName = value;
    } else if (value && typeof value === 'object') {
      fileName = value.name || '';
    }

    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string[]> = {
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      gif: ['image/gif'],
      pdf: ['application/pdf'],
      doc: ['application/msword'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    };

    const allowedExtensions = allowedTypes
      .map((type) => {
        for (const [ext, mimes] of Object.entries(mimeTypes)) {
          if (mimes.includes(type)) return ext;
        }
        return type.split('/').pop();
      })
      .filter(Boolean);

    if (!allowedExtensions.includes(extension)) {
      return { ok: false, message: 'mimes', value: allowedTypes.join(', ') };
    }

    return true;
  };

export const maxFileSize =
  (maxSizeInMB: number): RuleFn =>
  async (value) => {
    if (!value) return true;

    let fileSize = 0;
    if (value instanceof File) {
      fileSize = value.size;
    } else if (value && typeof value === 'object' && 'size' in value) {
      fileSize = value.size;
    }

    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    if (fileSize > maxSizeInBytes) {
      return { ok: false, message: 'max_file_size', value: maxSizeInMB };
    }

    return true;
  };

// Phone number validation
export const phoneRule: RuleFn = (value) => {
  if (!value) return true;

  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  if (!phoneRegex.test(String(value).replace(/[\s\-\(\)]/g, ''))) {
    return { ok: false, message: 'phone' };
  }
  return true;
};

// Credit card validation (Luhn algorithm)
export const creditCardRule: RuleFn = (value) => {
  if (!value) return true;

  const str = String(value).replace(/\s+/g, '');
  if (!/^\d+$/.test(str)) {
    return { ok: false, message: 'credit_card' };
  }

  let sum = 0;
  let isEven = false;

  for (let i = str.length - 1; i >= 0; i--) {
    let digit = parseInt(str.charAt(i), 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  if (sum % 10 !== 0) {
    return { ok: false, message: 'credit_card' };
  }

  return true;
};

// Array normalization rules
export const imagesRule: RuleFn = async (value: any) => {
  if (value === undefined || value === null || value === '') return true;

  try {
    if (Array.isArray(value)) return { ok: true, value };
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) || typeof parsed === 'object') {
          return { ok: true, value: parsed };
        }
      } catch {}

      if (value.includes(',')) {
        return {
          ok: true,
          value: value
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean),
        };
      }
      return { ok: true, value: [value] };
    }
    if (typeof value === 'object') return { ok: true, value };
    return { ok: true, value: [String(value)] };
  } catch (e) {
    return { ok: false, message: 'invalid_images' };
  }
};

export const amenitiesRule: RuleFn = async (value: any) => {
  if (value === undefined || value === null || value === '') return true;

  try {
    if (Array.isArray(value) || typeof value === 'object') return { ok: true, value };
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) || typeof parsed === 'object') {
          return { ok: true, value: parsed };
        }
      } catch {}

      if (value.includes(',')) {
        return {
          ok: true,
          value: value
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean),
        };
      }
      return { ok: true, value: [value] };
    }
    return { ok: true, value: [String(value)] };
  } catch (e) {
    return { ok: false, message: 'invalid_amenities' };
  }
};

// Nested object validation
export const nestedRule =
  (rules: Record<string, RuleSpec>): RuleFn =>
  async (value, field, payload) => {
    if (value === undefined || value === null) return true;

    if (typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, message: 'object' };
    }

    try {
      await validate(value, rules);
      return true;
    } catch (error) {
      return { ok: false, message: 'nested_validation_failed' };
    }
  };

// Array of objects validation
export const arrayOfObjectsRule =
  (rules: Record<string, RuleSpec>): RuleFn =>
  async (value, field, payload) => {
    if (value === undefined || value === null) return true;

    let array: any[];
    if (Array.isArray(value)) {
      array = value;
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        array = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return { ok: false, message: 'array' };
      }
    } else {
      array = [value];
    }

    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      if (typeof item !== 'object' || Array.isArray(item)) {
        return { ok: false, message: 'object_array' };
      }

      try {
        await validate(item, rules);
      } catch (error) {
        return { ok: false, message: `items[${i}].validation_failed` };
      }
    }

    return { ok: true, value: array };
  };

// Export utility functions for external use
export { formatMessage, resolveMessage };
