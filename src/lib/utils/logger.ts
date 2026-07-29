"use client";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
type LogCategory = "FIREBASE" | "AUTH" | "FIRESTORE" | "STORAGE" | "CACHE" | "NETWORK" | "SECURITY" | "GENERAL";

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  private formatMessage(level: LogLevel, category: LogCategory, message: string) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${category}] ${message}`;
  }

  debug(category: LogCategory, message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.debug(this.formatMessage("DEBUG", category, message), ...args);
    }
  }

  info(category: LogCategory, message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.info(this.formatMessage("INFO", category, message), ...args);
    }
  }

  warn(category: LogCategory, message: string, ...args: any[]) {
    console.warn(this.formatMessage("WARN", category, message), ...args);
  }

  error(category: LogCategory, message: string, error?: any, ...args: any[]) {
    console.error(this.formatMessage("ERROR", category, message), error, ...args);
  }
}

export const logger = new Logger();
