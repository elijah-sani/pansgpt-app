import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { AuthMessage as AuthMessageType } from './types';

type AuthMessageProps = {
  message: AuthMessageType;
};

export function AuthMessage({ message }: AuthMessageProps) {
  if (!message) {
    return null;
  }

  const className = message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700';

  return (
    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${className}`}>
      {message.type === 'error' ? (
        <AlertCircle className="w-5 h-5 shrink-0" />
      ) : (
        <CheckCircle2 className="w-5 h-5 shrink-0" />
      )}
      <p>{message.text}</p>
    </div>
  );
}
