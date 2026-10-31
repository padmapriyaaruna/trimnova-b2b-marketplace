/**
 * Minimal type stub for react-hot-toast.
 * Replace with the real package when npm permissions are available:
 *   npm install react-hot-toast
 */
declare module 'react-hot-toast' {
  import { ReactNode } from 'react';

  interface ToastOptions {
    id?:        string;
    duration?:  number;
    position?:  string;
    className?: string;
    style?:     React.CSSProperties;
    icon?:      ReactNode;
  }

  type Toast = (message: string | ReactNode, opts?: ToastOptions) => string;

  interface ToastAPI extends Toast {
    success:  Toast;
    error:    Toast;
    loading:  Toast;
    custom:   Toast;
    dismiss:  (id?: string) => void;
    remove:   (id?: string) => void;
    promise: <T>(
      promise: Promise<T>,
      msgs: { loading: string; success: string | ((data: T) => string); error: string },
      opts?: ToastOptions,
    ) => Promise<T>;
  }

  const toast: ToastAPI;
  export default toast;

  export function Toaster(props?: {
    position?: string;
    toastOptions?: ToastOptions;
  }): JSX.Element;
}
