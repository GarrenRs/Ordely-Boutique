import rateLimit from "express-rate-limit";

export const publicOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة، حاول لاحقاً" },
  validate: { xForwardedForHeader: false },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، حاول بعد 15 دقيقة" },
  validate: { xForwardedForHeader: false },
});
