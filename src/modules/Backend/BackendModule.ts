import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import express, { Express } from 'express';
import http from 'http';
import path from 'path';

export class BackendModule implements IModule {
  public readonly name = 'Backend';
  public app: Express;
  public server: http.Server;
  private port = 3001;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
  }

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Backend Module...');
      
      this.app.use(express.json());
      this.app.use("/assets", express.static(path.join(process.cwd(), "assets")));
      
      this.app.get("/api/health", (req, res) => {
        res.json({ status: "ok", time: new Date().toISOString() });
      });

      return new Promise((resolve) => {
        this.server.listen(this.port, () => {
          logger.info(`Backend Module running on port ${this.port}`);
          resolve(true);
        }).on('error', (err: any) => {
          logger.error('Failed to start Backend server', err);
          resolve(false);
        });
      });
    } catch (error) {
      logger.error('Error during Backend Module initialization', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Backend Module...');
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  public status(): any {
    return {
      status: 'OK',
      port: this.port
    };
  }
}

export const backendModule = new BackendModule();
