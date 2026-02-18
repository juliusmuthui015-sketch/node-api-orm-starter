import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import FileService from '@/app/Services/FileService';
import File from '@/app/Models/File/File';
import { ValidationError } from '@/app/Helpers/validator';
import { parseRequest } from '@/app/Helpers/auth';

type MulterFile = Express.Multer.File;

// Multer storage configuration
const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || String(10 * 1024 * 1024)); // 10 MB default
const ALLOWED_MIME = (
  process.env.ALLOWED_MIME_TYPES ||
  'image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const storage = multer.diskStorage({
  destination: (req: Request, file: MulterFile, cb: (error: any, destination: string) => void) =>
    cb(null, uploadDir),
  filename: (req: Request, file: MulterFile, cb: (error: any, filename: string) => void) => {
    const unique = Date.now() + '-' + Math.random().toString(16).slice(2);
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, unique + '-' + safeOriginal);
  },
});

export const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  },
});

const JWT_SECRET: string = process.env.FILE_URL_SECRET || process.env.JWT_SECRET || 'dev-secret-change';

export default {
  async index(req: Request, res: Response) {
    const queryRules: any = {
      user_id: 'nullable|exists:users,id',
      page: 'nullable|int',
      limit: 'nullable|int',
      sort: 'nullable|string|in:id,created_at,size',
      order: 'nullable|string|in:asc,desc',
    };
    try {
      await (req as any).validate(req.query, queryRules);
    } catch (_) {}
    const data = await FileService.list(parseRequest(req));
    res.json(data);
  },

  async show(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    res.json(file.toJSON());
  },

  async download(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    const diskPath = (file as any).disk_path;
    if (!diskPath || !fs.existsSync(diskPath))
      return res.status(404).json({ message: 'File missing on disk' });
    res.setHeader('Content-Type', (file as any).mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', (file as any).size || 0);
    res.setHeader('Content-Disposition', `attachment; filename="${(file as any).original_name}"`);
    fs.createReadStream(diskPath).pipe(res);
  },

  async store(req: Request, res: Response) {
    const user = (req as any).user;
    const upload = (req as any).file as MulterFile | undefined;
    if (!upload) return res.status(400).json({ message: 'No file uploaded' });
    try {
      const created = await FileService.createFromUpload(upload, user ? user.id : undefined);
      return res.status(201).json(created.toJSON());
    } catch (e) {
      const msg = String(e);
      const isTypeErr = /Unsupported file type/i.test(msg);
      const isSizeErr = /File too large|LIMIT_FILE_SIZE/i.test(msg);
      const status = isTypeErr || isSizeErr ? 422 : 500;
      return res.status(status).json({
        message: isTypeErr
          ? 'Unsupported file type'
          : isSizeErr
            ? 'File too large'
            : 'Upload failed',
        error: msg,
      });
    }
  },

  async storeRaw(req: Request, res: Response) {
    const rules = {
      filename: 'required|string',
      mime_type: 'required|string',
      content: 'required|string',
    } as any;
    let validated: any;
    try {
      validated = await req.validate(rules);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    try {
      const buffer = Buffer.from(validated.content, 'base64');
      const mime = validated.mime_type;
      if (!ALLOWED_MIME.includes(mime)) {
        return res.status(422).json({ message: 'Unsupported file type' });
      }
      if (buffer.length > MAX_UPLOAD_SIZE) {
        return res.status(422).json({ message: 'File too large' });
      }
      const user = (req as any).user;
      const created = await FileService.createFromBuffer(
        buffer,
        validated.filename,
        mime,
        user ? user.id : undefined,
      );
      return res.status(201).json(created.toJSON());
    } catch (e) {
      return res.status(500).json({ message: 'Raw upload failed', error: String(e) });
    }
  },

  async destroy(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file = await File.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    const user = (req as any).user;
    const isOwner =
      user && (file as any).user_id && String(user.id) === String((file as any).user_id);
    const canDelete = isOwner || (user && (user.roles || []).includes('admin'));
    if (!canDelete) return res.status(403).json({ message: 'Forbidden' });
    const ok = await FileService.delete(id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },

  async signedUrl(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    const expiresInSec = parseInt(process.env.FILE_URL_EXPIRES || '900');
    const payload = { file_id: (file as any).id } as any;
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/public/files/${token}`;
    const expires_at = new Date(Date.now() + expiresInSec * 1000).toISOString();
    res.json({ url, token, expires_at });
  },

  async publicDownload(req: Request, res: Response) {
    const token = req.params.token as string;
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: 'Invalid or expired link' });
    }
    const file = await FileService.find(decoded.file_id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    const diskPath = (file as any).disk_path;
    if (!diskPath || !fs.existsSync(diskPath))
      return res.status(404).json({ message: 'File missing on disk' });
    res.setHeader('Content-Type', (file as any).mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', (file as any).size || 0);
    res.setHeader('Content-Disposition', `attachment; filename="${(file as any).original_name}"`);
    fs.createReadStream(diskPath).pipe(res);
  },

  async view(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    const diskPath = (file as any).disk_path;
    if (!diskPath || !fs.existsSync(diskPath))
      return res.status(404).json({ message: 'File missing on disk' });
    res.setHeader('Content-Type', (file as any).mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(file as any).original_name}"`);
    fs.createReadStream(diskPath).pipe(res);
  },

  async thumbnail(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file: any = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    if (!/^(image\/(jpeg|png|webp|gif))$/.test(file.mime_type))
      return res.status(404).json({ message: 'No thumbnail' });
    const size = (req.query.size as string) || undefined;
    const format = req.query.format as string as 'webp' | 'original' | undefined;
    const thumbPath = await FileService.getThumbnailVariant(id, size, format);
    if (!thumbPath || !fs.existsSync(thumbPath))
      return res.status(404).json({ message: 'Thumbnail not generated' });
    const ext = path.extname(thumbPath).toLowerCase();
    const contentType =
      ext === '.webp'
        ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : ext === '.gif'
              ? 'image/gif'
              : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const downloadName = `thumb-${size || 'md'}-${file.original_name.replace(/\.[^.]+$/, '')}${ext}`;
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
    fs.createReadStream(thumbPath).pipe(res);
  },

  async regenerateThumbnail(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file: any = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    if (!/^(image\/(jpeg|png|webp|gif))$/.test(file.mime_type))
      return res.status(404).json({ message: 'Not an image' });
    const thumbPath = await FileService.regenerateThumbnail(id);
    if (!thumbPath) return res.status(500).json({ message: 'Regeneration failed' });
    res.json({ success: true, thumbnail_path: thumbPath, thumbnails: file.thumbnails || {} });
  },

  async signedThumbnailUrl(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:files,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const file: any = await FileService.find(id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    if (!/^(image\/(jpeg|png|webp|gif))$/.test(file.mime_type))
      return res.status(404).json({ message: 'No thumbnail' });
    const size = (req.query.size as string) || undefined;
    const format = req.query.format as string as 'webp' | 'original' | undefined;
    const expiresInSec = parseInt(
      process.env.THUMB_URL_EXPIRES || process.env.FILE_URL_EXPIRES || '900',
    );
    const payload: any = { file_id: file.id, size: size, format: format, kind: 'thumbnail' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/public/thumbnails/${token}`;
    const expires_at = new Date(Date.now() + expiresInSec * 1000).toISOString();
    res.json({ url, token, expires_at, size: size || null, format: format || null });
  },

  async publicThumbnail(req: Request, res: Response) {
    const token = req.params.token as string;
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: 'Invalid or expired link' });
    }
    if (!decoded || decoded.kind !== 'thumbnail')
      return res.status(400).json({ message: 'Bad token kind' });
    const file: any = await FileService.find(decoded.file_id);
    if (!file) return res.status(404).json({ message: 'Not found' });
    if (!/^(image\/(jpeg|png|webp|gif))$/.test(file.mime_type))
      return res.status(404).json({ message: 'No thumbnail' });
    const thumbPath = await FileService.getThumbnailVariant(
      decoded.file_id,
      decoded.size,
      decoded.format,
    );
    if (!thumbPath || !fs.existsSync(thumbPath))
      return res.status(404).json({ message: 'Thumbnail not generated' });
    const ext = path.extname(thumbPath).toLowerCase();
    const contentType =
      ext === '.webp'
        ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : ext === '.gif'
              ? 'image/gif'
              : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const sizeKey = decoded.size || 'md';
    const downloadName = `thumb-${sizeKey}-${file.original_name.replace(/\.[^.]+$/, '')}${ext}`;
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
    fs.createReadStream(thumbPath).pipe(res);
  },
};
