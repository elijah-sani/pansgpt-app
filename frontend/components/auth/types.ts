export type AuthView = 'login' | 'signup' | 'forgot';

export type AuthMessage = {
  type: 'error' | 'success';
  text: string;
} | null;

export type SignupFormData = {
  firstName: string;
  otherNames: string;
  university: string;
  level: string;
  email: string;
  password: string;
};
