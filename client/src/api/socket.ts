/**
 * Socket.IO 客户端封装
 *  - 开发环境：直连 origin/proxy（http://localhost:5173 -> :3000 由 vite 代理）
 *  - 生产环境：window.location.origin（同端口 3000）
 */
import { io, Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from '../types/protocol';

let _socket: (Socket<ServerEvents, ClientEvents> & { _inited?: boolean }) | null = null;

export function getSocket(): Socket<ServerEvents, ClientEvents> {
  if (_socket) return _socket;
  // Vite 开发模式端口 5173，服务端端口 3000（代理通过 /socket.io 路径）
  // 生产构建：访问 origin 同端口即可（Node 服务端托管 dist + Socket.IO 同一 3000）
  const url = window.location.origin;
  _socket = io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1500,
  }) as any;
  return _socket!;
}

/** 类型安全的 emit：Promise 化 ack，避免回调地狱 */
export function emit(
  event: string,
  ...args: any[]
): Promise<{ ok: boolean; data: any }> {
  return new Promise(resolve => {
    const socket = getSocket();
    (socket.emit as any)(event, ...args, (ok: boolean, data: any) => {
      resolve({ ok, data });
    });
  });
}

export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
