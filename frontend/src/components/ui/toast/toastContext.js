import { createContext, useContext } from 'react';

const noop = () => {};

export const ToastContext = createContext({ success: noop, error: noop, info: noop, dismiss: noop });

// const toast = useToast();
// toast.success('Saved'); toast.error('Upload failed', { description: reason });
export const useToast = () => useContext(ToastContext);
