import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { travelStore } from '../stores/travelStore';

export const useWebSocket = () => {
  const socketRef = useRef(null);

  useEffect(() => {
    // default transport order: polling completes the handshake first, then
    // upgrades to websocket - avoids the "WebSocket is closed before the
    // connection established" race under React StrictMode's double-mount
    const socket = io(import.meta.env.VITE_WS_URL, {
      transports: ['polling', 'websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('join-dashboard');
    });

    socket.on('connect_error', (err) => {
      console.warn('WebSocket connect_error:', err?.message || err);
    });

    socket.on('new-travel', (data) => {
      travelStore.getState().addTravel(data.travel);
      if (data.unpaid) {
        console.warn('Unpaid travel detected!', data.unpaid);
      }
    });

    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);
};