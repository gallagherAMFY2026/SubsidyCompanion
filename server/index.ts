import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Secure PDF file serving with validation and access control
app.use('/pdfs', (req: Request, res: Response, next: NextFunction) => {
  try {
    // Decode URL path (handles %20 spaces and other URL encoding)
    const decodedPath = decodeURIComponent(req.path);
    
    // Only allow .pdf files (prevents directory traversal to other file types)
    if (!decodedPath.toLowerCase().endsWith('.pdf')) {
      return res.status(403).json({ error: 'Access denied - PDF files only' });
    }

    // Build and normalize the full path
    const pdfsRoot = path.resolve(__dirname, '../static/pdfs');
    const requestedPath = path.normalize(path.join(pdfsRoot, decodedPath));
    
    // Security check: ensure the resolved path is within the pdfs directory
    if (!requestedPath.startsWith(pdfsRoot)) {
      log(`Directory traversal attempt blocked: ${decodedPath}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify file exists before serving
    if (!fs.existsSync(requestedPath)) {
      log(`PDF not found at: ${requestedPath}`);
      return res.status(404).json({ error: 'Document not found' });
    }

    // Set secure headers for PDF downloads
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline'); // Display in browser, not auto-download
    
    next();
  } catch (error) {
    log(`PDF serving error: ${error}`);
    return res.status(400).json({ error: 'Invalid request' });
  }
}, express.static(path.join(__dirname, '../static/pdfs')));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
