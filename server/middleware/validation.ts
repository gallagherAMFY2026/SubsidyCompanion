import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Request validation schemas
export const brazilSyncPortalSchema = z.object({
  program: z.string().max(100).optional(),
  maxPages: z.number().int().min(1).max(10).optional().default(5)
});

export const chileSearchTermsSchema = z.object({
  searchTerms: z.string().max(200).optional()
});

export const grantsSearchSchema = z.object({
  keyword: z.string().max(100).optional(),
  fundingInstrument: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  eligibility: z.string().max(50).optional(),
  startRecordNum: z.coerce.number().int().min(1).max(1000).optional().default(1),
  rows: z.coerce.number().int().min(1).max(100).optional().default(25),
  maxPages: z.coerce.number().int().min(1).max(10).optional().default(5),
  agencies: z.string().max(200).optional(),
  oppStatuses: z.string().max(100).optional(),
  fundingCategories: z.string().max(200).optional()
});

export const programsSearchSchema = z.object({
  category: z.string().max(50).optional(),
  location: z.string().max(50).optional(),
  program: z.string().max(100).optional(),
  dataSource: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  query: z.string().max(100).optional(),
  force_refresh: z.coerce.boolean().optional().default(false)
});

export const generalSyncSchema = z.object({
  maxPages: z.number().int().min(1).max(10).optional().default(5),
  forceRefresh: z.boolean().optional().default(false)
});

export const syncRequestSchema = z.object({
  apiKey: z.string().min(32).optional() // For admin authentication
});

// Validation middleware factory
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: result.error.issues
        });
      }
      req.body = result.data;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Validation failed' });
    }
  };
}

export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: result.error.issues
        });
      }
      req.query = result.data as any;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Query validation failed' });
    }
  };
}

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const clientData = rateLimitStore.get(clientIP);
    
    if (!clientData || now > clientData.resetTime) {
      // First request or window expired
      rateLimitStore.set(clientIP, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }
    
    if (clientData.count >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        resetTime: new Date(clientData.resetTime).toISOString()
      });
    }
    
    clientData.count++;
    next();
  };
}

// Admin authentication middleware
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  
  // CRITICAL: Admin key is mandatory for production security
  if (!adminKey) {
    console.error('ADMIN_API_KEY not configured - this is required for sync endpoint security');
    return res.status(500).json({ 
      error: 'Server configuration error: ADMIN_API_KEY required',
      documentation: 'Set ADMIN_API_KEY environment variable to secure admin endpoints'
    });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Missing authorization header',
      required: 'Bearer <ADMIN_API_KEY>'
    });
  }
  
  const providedKey = authHeader.substring(7);
  
  if (providedKey !== adminKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [ip, data] of entries) {
    if (now > data.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 60000); // Cleanup every minute