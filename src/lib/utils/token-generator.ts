/**
 * Cryptographically secure token generation for exam share links
 * 
 * Security Requirements:
 * - Must use crypto-secure randomness (not Math.random)
 * - Must be unpredictable and unique
 * - Must NOT expose database IDs
 * - Must be URL-safe
 */

import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure share token for exams
 * 
 * @param length - Token length in bytes (default: 32 bytes = 43 URL-safe chars)
 * @returns URL-safe base64 encoded token
 * 
 * @example
 * const token = generateSecureShareToken();
 * // Returns: "Ab8Kx92LmPqR7nS3tU4vW5xY6zA1bC2dE3fG4hJ5kL6mN7oP8q"
 */
export function generateSecureShareToken(length: number = 32): string {
  // Generate cryptographically secure random bytes
  const buffer = randomBytes(length);
  
  // Convert to URL-safe base64 (replace +/= with -_~)
  const token = buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '~');
  
  return token;
}

/**
 * Validate a share token format
 * 
 * @param token - Token to validate
 * @returns true if token appears to be a valid share token format
 */
export function isValidShareTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  
  // Must be at least 32 characters (reasonable minimum)
  if (token.length < 32) return false;
  
  // Must contain only URL-safe base64 characters
  const urlSafeBase64Regex = /^[A-Za-z0-9\-_~]+$/;
  if (!urlSafeBase64Regex.test(token)) return false;
  
  return true;
}

/**
 * Generate a share URL for an exam
 * 
 * @param token - The exam's share token
 * @param baseUrl - Base URL of the application (from env)
 * @returns Complete shareable URL
 * 
 * @example
 * const url = generateExamShareUrl(exam.shareToken, process.env.NEXT_PUBLIC_APP_URL);
 * // Returns: "https://your-domain.com/exam/join/Ab8Kx92LmP..."
 */
export function generateExamShareUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || '';
  
  // Remove trailing slash from base URL
  const cleanBase = base.replace(/\/$/, '');
  
  return `${cleanBase}/exam/join/${token}`;
}
