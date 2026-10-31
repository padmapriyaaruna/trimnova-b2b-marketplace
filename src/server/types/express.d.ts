// Express global type augmentation for TrimNova
declare namespace Express {
  interface Request {
    user?: {
      id: string;
      userId: string;
      email: string;
      role: string;
    };
    rawBody?: Buffer;
  }
}

export {};

