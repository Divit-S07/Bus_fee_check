import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { travelStore } from '../stores/travelStore';

export const useWebSocket = () => {
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_WS_URL, {
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('join-dashboard');
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