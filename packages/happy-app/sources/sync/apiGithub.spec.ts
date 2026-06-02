import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { disconnectGitHub } from './apiGithub';
import { AuthCredentials } from '@/auth/tokenStorage';

// Mock the serverConfig
vi.mock('./serverConfig', () => ({
    getServerUrl: () => 'https://api.test.com'
}));

// Mock time utilities (apiFetch uses delay for backoff; resolve instantly in tests)
vi.mock('@/utils/time', () => ({
    backoff: vi.fn((fn) => fn()),
    delay: vi.fn(() => Promise.resolve())
}));

describe('apiGithub', () => {
    const mockCredentials: AuthCredentials = {
        token: 'test-token',
        secret: 'test-secret'
    };

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();
        // Mock global fetch
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('disconnectGitHub', () => {
        it('should successfully disconnect GitHub account', async () => {
            // Mock successful response
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ success: true })
            };
            global.fetch = vi.fn().mockResolvedValue(mockResponse);

            await expect(disconnectGitHub(mockCredentials)).resolves.toBeUndefined();

            // apiFetch injects an AbortSignal for the per-attempt timeout, so match loosely.
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.test.com/v1/connect/github',
                expect.objectContaining({
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer test-token'
                    }
                })
            );
        });

        it('should throw error when GitHub account is not connected', async () => {
            // Mock 404 response
            const mockResponse = {
                ok: false,
                status: 404,
                json: vi.fn().mockResolvedValue({ error: 'GitHub account not connected' })
            };
            global.fetch = vi.fn().mockResolvedValue(mockResponse);

            await expect(disconnectGitHub(mockCredentials))
                .rejects.toThrow('GitHub account not connected');
        });

        it('should throw error when server returns non-success response', async () => {
            // Mock successful HTTP response but unsuccessful operation
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ success: false })
            };
            global.fetch = vi.fn().mockResolvedValue(mockResponse);

            await expect(disconnectGitHub(mockCredentials))
                .rejects.toThrow('Failed to disconnect GitHub account');
        });

        it('should throw generic error for other HTTP errors', async () => {
            // Mock 500 response
            const mockResponse = {
                ok: false,
                status: 500,
                json: vi.fn().mockResolvedValue({ error: 'Internal server error' })
            };
            global.fetch = vi.fn().mockResolvedValue(mockResponse);

            await expect(disconnectGitHub(mockCredentials))
                .rejects.toThrow('Failed to disconnect GitHub: 500');
        });
    });
});