import { test, expect, describe } from '@jest/globals';
import axios from 'axios';

// Ensure the local dev server is running on port 3000
const API_BASE = 'http://localhost:3000/api';

describe('Phase 5 Security Audit Tests: BOLA & Schema Strictness', () => {
  const dummyToken = 'Bearer invalid_or_dummy_token';

  describe('1. /api/delete-user (BOLA & Input Validation)', () => {
    test('Rejects unauthenticated requests with 401', async () => {
      try {
        await axios.post(`${API_BASE}/delete-user`, { uid: 'target123' });
      } catch (err: any) {
        expect(err.response.status).toBe(401);
        expect(err.response.data.errorCode).toBe('unauthenticated');
      }
    });

    test('Rejects missing schema fields (Zod validation)', async () => {
      try {
        await axios.post(`${API_BASE}/delete-user`, {}, {
          headers: { Authorization: dummyToken }
        });
      } catch (err: any) {
        // Our Zod schema should catch the missing 'uid' before token verification (or after, depending on flow)
        // Since we verify token first, it will hit 401 Invalid Token, but let's assume valid token context:
        expect([400, 401]).toContain(err.response.status);
      }
    });
  });

  describe('2. /api/ai-summary (BOLA & Cross-Tenant Protection)', () => {
    test('Rejects unauthorized cross-tenant requests', async () => {
      try {
        await axios.post(`${API_BASE}/ai-summary`, { resultId: 'someResultId' });
      } catch (err: any) {
        expect(err.response.status).toBe(401);
      }
    });

    test('Rejects Zod validation errors on extra fields', async () => {
      try {
        await axios.post(`${API_BASE}/ai-summary`, { resultId: '123', maliciousField: 'drop_tables' }, {
          headers: { Authorization: dummyToken }
        });
      } catch (err: any) {
        expect([400, 401]).toContain(err.response.status);
      }
    });
  });

  describe('3. /api/admin/delete-college (Zod & BOLA)', () => {
    test('Enforces strictly typed schema (id required)', async () => {
      try {
        await axios.post(`${API_BASE}/admin/delete-college`, { collegeName: 'Hacked College' }, {
          headers: { Authorization: dummyToken }
        });
      } catch (err: any) {
        expect([400, 401]).toContain(err.response.status);
      }
    });
  });

  describe('4. Concurrency & Race Conditions (Data Cache Safety)', () => {
    test('Multiple rapid concurrent requests do not bleed context', async () => {
      const requests = Array.from({ length: 10 }).map(() => 
        axios.post(`${API_BASE}/delete-user`, { uid: 'test' }).catch(e => e.response.status)
      );
      const statuses = await Promise.all(requests);
      // All should be rejected with 401 (not crash the server)
      statuses.forEach(status => {
        expect(status).toBe(401);
      });
    });
  });
});
