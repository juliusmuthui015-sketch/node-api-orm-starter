# Broadcasting System Documentation

The broadcasting system provides real-time WebSocket communication for your application, similar to Laravel's broadcasting feature. It allows you to broadcast events to connected clients over WebSocket channels.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Channels](#channels)
- [Broadcasting Events](#broadcasting-events)
- [Client Integration](#client-integration)
- [API Reference](#api-reference)

---

## Quick Start

### 1. Enable Broadcasting

Set the broadcast driver in your `.env` file:

```env
BROADCAST_DRIVER=websocket
```

### 2. Define Channels

Edit `src/routes/channels.ts` to define your broadcast channels:

```typescript
import { Broadcast } from '@/eloquent/Core/Broadcasting';

// Public channel - anyone can subscribe
Broadcast.public('news');

// Private channel - requires authentication
Broadcast.private('orders.{orderId}', (user, orderId) => {
    return user.orders.includes(parseInt(orderId));
});

// Presence channel - tracks online members
Broadcast.presence('chat.{roomId}', (user, roomId) => {
    return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
    };
});
```

### 3. Broadcast Events

```typescript
import { broadcast, Broadcast } from '@/eloquent/Core/Broadcasting';

// Simple broadcast
await broadcast('NewMessage', 'chat-room.1', { 
    message: 'Hello!',
    user: 'John',
});

// Using fluent API
await Broadcast.to('private-orders.123')
    .send('OrderUpdated', { status: 'shipped' });

// Broadcast to multiple channels
await Broadcast.to(['private-user.1', 'admin-dashboard'])
    .send('PaymentReceived', { amount: 100 });
```

---

## Configuration

### Environment Variables

```env
# Broadcast driver: websocket, log, null
BROADCAST_DRIVER=websocket

# WebSocket path (default: /ws)
BROADCAST_WEBSOCKET_PATH=/ws

# Ping interval in milliseconds (default: 25000)
BROADCAST_PING_INTERVAL=25000

# Ping timeout in milliseconds (default: 20000)
BROADCAST_PING_TIMEOUT=20000

# Auth endpoint (default: /broadcasting/auth)
BROADCAST_AUTH_ENDPOINT=/broadcasting/auth
```

### Configuration File

Configuration is located at `src/config/broadcasting.config.ts`:

```typescript
export const broadcastingConfig = {
    default: process.env.BROADCAST_DRIVER || 'websocket',
    
    connections: {
        websocket: {
            driver: 'websocket',
            path: '/ws',
            pingInterval: 25000,
            pingTimeout: 20000,
        },
        log: {
            driver: 'log',
        },
        null: {
            driver: 'null',
        },
    },
};
```

---

## Channels

### Channel Types

#### Public Channels

Anyone can subscribe to public channels without authentication.

```typescript
// Define a public channel
Broadcast.public('announcements');

// Client subscribes to public channel
socket.send(JSON.stringify({ type: 'subscribe', channel: 'announcements' }));
```

#### Private Channels

Private channels require authentication. The channel name must be prefixed with `private-`.

```typescript
// Define a private channel with authorization
Broadcast.private('orders.{orderId}', async (user, orderId) => {
    const order = await Order.find(orderId);
    return order && order.user_id === user.id;
});

// Client must authenticate first, then subscribe
socket.send(JSON.stringify({ type: 'auth', token: 'jwt-token' }));
socket.send(JSON.stringify({ type: 'subscribe', channel: 'private-orders.123' }));
```

#### Presence Channels

Presence channels track who is subscribed. The channel name must be prefixed with `presence-`.

```typescript
// Define a presence channel
Broadcast.presence('chat.{roomId}', (user, roomId) => {
    // Return user info to share with other members
    return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
    };
});
```

### Channel Authorization

Authorization callbacks receive the authenticated user and any route parameters:

```typescript
// Single parameter
Broadcast.private('user.{userId}', (user, userId) => {
    return user.id === parseInt(userId);
});

// Multiple parameters
Broadcast.private('property.{propertyId}.unit.{unitId}', (user, propertyId, unitId) => {
    // Check user has access to both property and unit
    return checkAccess(user, propertyId, unitId);
});

// Async authorization
Broadcast.private('invoice.{invoiceId}', async (user, invoiceId) => {
    const invoice = await Invoice.find(invoiceId);
    return invoice && invoice.user_id === user.id;
});
```

---

## Broadcasting Events

### Simple Broadcasting

```typescript
import { broadcast } from '@/eloquent/Core/Broadcasting';

// Broadcast to a single channel
await broadcast('EventName', 'channel-name', { key: 'value' });

// Broadcast to multiple channels
await broadcast('EventName', ['channel-1', 'channel-2'], { key: 'value' });
```

### Using the Broadcast Facade

```typescript
import { Broadcast } from '@/eloquent/Core/Broadcasting';

// Fluent API
await Broadcast.to('channel-name')
    .with({ extra: 'data' })
    .send('EventName', { message: 'Hello' });

// Exclude a socket from receiving the broadcast
await Broadcast.to('channel-name')
    .except(socketId)
    .send('EventName', { data: 'value' });
```

### Event Classes

Create broadcastable event classes for better organization:

```typescript
import { Event } from '@/eloquent/Core/Events';
import { ShouldBroadcast, BroadcastAs } from '@/eloquent/Core/Broadcasting';

@ShouldBroadcast()
@BroadcastAs('order.shipped')
export class OrderShippedEvent extends Event {
    constructor(
        public orderId: number,
        public trackingNumber: string
    ) {
        super();
    }

    eventName(): string {
        return 'order.shipped';
    }

    broadcastOn(): string[] {
        return [`private-orders.${this.orderId}`];
    }

    broadcastWith(): Record<string, any> {
        return {
            orderId: this.orderId,
            trackingNumber: this.trackingNumber,
            shippedAt: new Date(),
        };
    }
}

// Dispatch the event
await broadcast(new OrderShippedEvent(123, 'TRACK123'));
```

### Event Decorators

```typescript
// Set channels to broadcast on
@ShouldBroadcast(['channel-1', 'channel-2'])

// Set the broadcast event name
@BroadcastAs('custom.event.name')

// Conditional broadcasting
@BroadcastWhen((event) => event.user.notificationsEnabled)

// Custom broadcast data
@BroadcastWith((event) => ({ id: event.id, name: event.name }))

// Exclude sender from broadcast
@BroadcastToOthers()
```

---

## Client Integration

### JavaScript/TypeScript Client

```typescript
class BroadcastClient {
    private socket: WebSocket;
    private socketId: string | null = null;

    constructor(url: string) {
        this.socket = new WebSocket(url);
        this.setupHandlers();
    }

    private setupHandlers() {
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connected':
                    this.socketId = message.socketId;
                    console.log('Connected with ID:', this.socketId);
                    break;
                    
                case 'subscribed':
                    console.log('Subscribed to:', message.channel);
                    break;
                    
                case 'event':
                    console.log(`Event ${message.event} on ${message.channel}:`, message.data);
                    this.emit(message.channel, message.event, message.data);
                    break;
                    
                case 'presence_subscribed':
                    console.log('Presence members:', message.members);
                    break;
                    
                case 'presence_member_added':
                    console.log('Member joined:', message.member);
                    break;
                    
                case 'presence_member_removed':
                    console.log('Member left:', message.member);
                    break;
                    
                case 'error':
                    console.error('Error:', message.message);
                    break;
            }
        };
    }

    auth(token: string) {
        this.send({ type: 'auth', token });
    }

    subscribe(channel: string) {
        this.send({ type: 'subscribe', channel });
    }

    unsubscribe(channel: string) {
        this.send({ type: 'unsubscribe', channel });
    }

    whisper(channel: string, event: string, data: any) {
        this.send({ type: 'whisper', channel, event, data });
    }

    private send(message: any) {
        this.socket.send(JSON.stringify(message));
    }
}

// Usage
const broadcast = new BroadcastClient('ws://localhost:3000/ws');

// Authenticate (for private/presence channels)
broadcast.auth('your-jwt-token');

// Subscribe to channels
broadcast.subscribe('announcements');          // Public
broadcast.subscribe('private-user.123');       // Private
broadcast.subscribe('presence-chat.room1');    // Presence

// Send client-to-client message (whisper)
broadcast.whisper('private-chat.room1', 'typing', { user: 'John' });
```

### React Hook Example

```typescript
import { useEffect, useState, useCallback } from 'react';

interface UseBroadcastOptions {
    url: string;
    token?: string;
    channels?: string[];
}

export function useBroadcast({ url, token, channels = [] }: UseBroadcastOptions) {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [socketId, setSocketId] = useState<string | null>(null);

    useEffect(() => {
        const ws = new WebSocket(url);
        
        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);
        
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'connected') {
                setSocketId(message.socketId);
                
                // Authenticate if token provided
                if (token) {
                    ws.send(JSON.stringify({ type: 'auth', token }));
                }
                
                // Subscribe to channels
                channels.forEach(channel => {
                    ws.send(JSON.stringify({ type: 'subscribe', channel }));
                });
            }
        };
        
        setSocket(ws);
        
        return () => ws.close();
    }, [url, token, channels.join(',')]);

    const subscribe = useCallback((channel: string) => {
        socket?.send(JSON.stringify({ type: 'subscribe', channel }));
    }, [socket]);

    const unsubscribe = useCallback((channel: string) => {
        socket?.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }, [socket]);

    return { socket, connected, socketId, subscribe, unsubscribe };
}
```

---

## API Reference

### Broadcast Facade

| Method | Description |
|--------|-------------|
| `Broadcast.event(event, channels, data)` | Broadcast an event to channels |
| `Broadcast.to(channels)` | Start a pending broadcast to channels |
| `Broadcast.on(channels)` | Alias for `to()` |
| `Broadcast.channel(name, authorizer)` | Define a channel with authorization |
| `Broadcast.private(name, authorizer)` | Define a private channel |
| `Broadcast.presence(name, authorizer)` | Define a presence channel |
| `Broadcast.public(name)` | Define a public channel |
| `Broadcast.initialize()` | Initialize the broadcast manager |
| `Broadcast.shutdown()` | Shutdown broadcasting |
| `Broadcast.getConnections()` | Get all active connections |
| `Broadcast.getChannelConnections(channel)` | Get connections for a channel |

### Client Message Types

| Type | Description | Payload |
|------|-------------|---------|
| `subscribe` | Subscribe to a channel | `{ channel: string }` |
| `unsubscribe` | Unsubscribe from a channel | `{ channel: string }` |
| `auth` | Authenticate with token | `{ token: string }` |
| `ping` | Ping the server | `{}` |
| `whisper` | Send client-to-client message | `{ channel, event, data }` |

### Server Message Types

| Type | Description | Payload |
|------|-------------|---------|
| `connected` | Connection established | `{ socketId: string }` |
| `subscribed` | Successfully subscribed | `{ channel: string }` |
| `unsubscribed` | Successfully unsubscribed | `{ channel: string }` |
| `event` | Event broadcast | `{ channel, event, data }` |
| `presence_subscribed` | Joined presence channel | `{ channel, members[] }` |
| `presence_member_added` | Member joined | `{ channel, member }` |
| `presence_member_removed` | Member left | `{ channel, member }` |
| `error` | Error occurred | `{ message, code }` |
| `pong` | Ping response | `{}` |

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_MESSAGE` | Message format is invalid |
| `AUTH_NOT_CONFIGURED` | Server authentication not configured |
| `AUTH_FAILED` | Token validation failed |
| `AUTH_ERROR` | Authentication error |
| `AUTH_REQUIRED` | Authentication required for channel |
| `UNAUTHORIZED` | User not authorized for channel |
| `CHANNEL_NOT_FOUND` | Channel not defined |
| `NOT_SUBSCRIBED` | Not subscribed to channel |
| `WHISPER_NOT_ALLOWED` | Whispers only on private/presence |

---

## Examples

### Real-time Notifications

```typescript
// Server-side
import { broadcast } from '@/eloquent/Core/Broadcasting';

async function sendNotification(userId: number, notification: Notification) {
    await broadcast('NotificationReceived', `private-notifications.${userId}`, {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        createdAt: notification.created_at,
    });
}
```

### Live Order Updates

```typescript
// Server-side
import { Broadcast } from '@/eloquent/Core/Broadcasting';

async function updateOrderStatus(order: Order, newStatus: string) {
    order.status = newStatus;
    await order.save();
    
    await Broadcast.to([
        `private-orders.${order.id}`,
        `private-user.${order.user_id}`,
    ]).send('OrderStatusChanged', {
        orderId: order.id,
        status: newStatus,
        updatedAt: new Date(),
    });
}
```

### Presence Channel for Chat

```typescript
// Channel definition
Broadcast.presence('chat.{roomId}', async (user, roomId) => {
    const room = await ChatRoom.find(roomId);
    if (!room || !room.members.includes(user.id)) return false;
    
    return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        status: 'online',
    };
});

// Broadcasting a message
await Broadcast.to(`presence-chat.${roomId}`).send('NewMessage', {
    id: message.id,
    content: message.content,
    sender: { id: user.id, name: user.name },
    sentAt: new Date(),
});
```

