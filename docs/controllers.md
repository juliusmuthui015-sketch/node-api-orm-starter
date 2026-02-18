# Controllers

Controllers handle HTTP requests and return responses.

## Basic Controller

```typescript
import { Request, Response } from 'express';
import Post from '@/app/Models/Post';
import { ValidationError } from '@/app/Helpers/validator';

export default {
    async index(req: Request, res: Response) {
        const posts = await Post.paginate(10, req.query.page);
        res.json(posts);
    },

    async show(req: Request, res: Response) {
        const id = req.params.id as string;
        const post = await Post.find(id);
        if (!post) return res.status(404).json({ message: 'Not found' });
        res.json(post);
    },

    async store(req: Request, res: Response) {
        try {
            const validated = await req.validate({
                title: 'required|string|max:255',
                content: 'required|string',
            });
            const post = await Post.create({
                ...validated,
                user_id: req.user?.id,
            });
            res.status(201).json(post);
        } catch (e) {
            if (e instanceof ValidationError) {
                return res.status(422).json({ errors: e.errors });
            }
            throw e;
        }
    },

    async update(req: Request, res: Response) {
        const id = req.params.id as string;
        const post = await Post.find(id);
        if (!post) return res.status(404).json({ message: 'Not found' });

        try {
            const validated = await req.validate({
                title: 'nullable|string|max:255',
                content: 'nullable|string',
            });
            await post.update(validated);
            res.json(post);
        } catch (e) {
            if (e instanceof ValidationError) {
                return res.status(422).json({ errors: e.errors });
            }
            throw e;
        }
    },

    async destroy(req: Request, res: Response) {
        const id = req.params.id as string;
        const post = await Post.find(id);
        if (!post) return res.status(404).json({ message: 'Not found' });
        await post.delete();
        res.json({ success: true });
    },
};
```

## Request Validation

```typescript
const rules = {
    name: 'required|string|max:255',
    email: 'required|email|unique:users,email',
    password: 'required|string|min:8|confirmed',
    status: 'required|string|in:draft,published',
    category_id: 'required|exists:categories,id',
};

const validated = await req.validate(rules);
```

## Response Methods

```typescript
res.json(data);                    // 200 with JSON
res.status(201).json(data);        // 201 Created
res.status(404).json({ message }); // 404 Not Found
res.status(422).json({ errors });  // 422 Validation Error
```

